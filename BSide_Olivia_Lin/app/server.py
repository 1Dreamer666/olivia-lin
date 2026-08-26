#!/usr/bin/env python3
"""BSide · 林离的信箱 —— 零依赖演示服务器（stdlib only）

路由：
  GET  /                静态页（static/）
  GET  /api/status      模型空壳状态（端点探活 + genai 加载情况）+ 生效配置 + 记忆库摘要
  GET  /api/memory      读取分级记忆（长期画像 + 最近情景）
  POST /api/memory      {"reset": true} 重置记忆
  POST /api/letter      {"text":"…", "force":"auto|model|local"} → 回信

行为：
  模型端点（默认 http://127.0.0.1:8045，config.json 的 model 段可改）可达时，
  用 skill/loader 组装的 system prompt 走真实调用；不可达时自动降级到
  skill/local_engine 本地人格引擎 —— 页面永远"有回音"。

  每封回信都会写入 skill/memory_bank 的三级记忆：L1 工作记忆（仅当轮）
  → L2 情景记忆（滚动保存最近 30 条）→ L3 长期画像（按频率 / 时间从
  情景记忆中"晋升"聚合）。这让林离在后续回信中能自然地回想起你之前
  写过的内容；文件位于 config.memory.path（默认 skill_root/data/memory.json），
  可直接编辑。

打包为 exe（PyInstaller onedir）后：
  - 资源（app/static、persona、samples、config.json）被打进 sys._MEIPASS
  - 用户可编辑的 config.json / data/memory.json 放在 exe 同级目录
  - 启动后默认自动打开浏览器（open_browser: true 时）

运行（与项目所在目录无关）：
  python app/server.py
  端口 / 静态目录 / 语料目录 / 模型端点 均可在项目根 config.json 中修改，
  或用环境变量覆盖（PORT / HOST / OLIVIA_CONFIG / OLIVIA_SKILL_ROOT /
  OLIVIA_ENDPOINT / OLIVIA_MODEL / OLIVIA_API_KEY / OLIVIA_TIMEOUT /
  OLIVIA_MEMORY / OLIVIA_BROWSER=0 关闭自动开浏览器）。
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
import traceback
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

APP_DIR = Path(__file__).resolve().parent
_BOOT_ROOT = APP_DIR.parent

# 是否由 PyInstaller 打包运行
FROZEN = bool(getattr(sys, "frozen", False))
if FROZEN:
    # 资源根：onefile 临时解压目录 / onedir 基础目录
    _RESOURCE_ROOT = Path(getattr(sys, "_MEIPASS", APP_DIR))
    # 可写根：exe 同级目录（用户可放 config.json / data/）
    _WRITABLE_ROOT = Path(sys.executable).resolve().parent
else:
    _RESOURCE_ROOT = _BOOT_ROOT
    _WRITABLE_ROOT = _BOOT_ROOT


def _boot_find_config() -> tuple[dict, Path | None]:
    """启动期配置发现（不依赖 skill 包，先解决"从哪 import"的鸡蛋问题）。

    查找顺序：OLIVIA_CONFIG 环境变量 → exe 同级目录（frozen 时优先）→ app/ 上级目录
    的 config.json → 工作目录的。frozen 时把 exe 同级目录放在最前，是为了
    让用户可以"把 config.json 放在 exe 旁边直接编辑"。
    """
    cands: list[Path] = []
    env = os.environ.get("OLIVIA_CONFIG")
    if env:
        cands.append(Path(env).expanduser())
    if FROZEN:
        cands.append(_WRITABLE_ROOT / "config.json")
    cands.append(_RESOURCE_ROOT / "config.json")
    cands.append(_BOOT_ROOT / "config.json")
    cands.append(Path.cwd() / "config.json")
    for c in cands:
        try:
            if c.is_file():
                data = json.loads(c.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    return data, c.resolve()
        except (OSError, json.JSONDecodeError):
            continue
    return {}, None


_boot_cfg, _boot_cfg_file = _boot_find_config()
if _boot_cfg_file:
    os.environ["OLIVIA_CONFIG"] = str(_boot_cfg_file)  # skill.config 复用同一份配置

# frozen 时让 skill 包直接可被 import（_MEIPASS 里有 skill/ 目录）
if FROZEN and str(_RESOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(_RESOURCE_ROOT))
sys.path.insert(0, str(_BOOT_ROOT))                   # 默认布局下导入 skill 包
try:
    from skill import config as skill_config          # noqa: E402
except ModuleNotFoundError:
    # 拆分布局：skill 包不在 app/ 旁边，按 config.skill_root 找到它
    sr = _boot_cfg.get("skill_root", "auto")
    if sr and sr != "auto":
        p = Path(str(sr)).expanduser()
        if not p.is_absolute():
            p = (_boot_cfg_file.parent if _boot_cfg_file else Path.cwd()) / p
        sys.path.insert(0, str(p.resolve()))
    from skill import config as skill_config          # noqa: E402

_cfg, _cfg_file = skill_config.load_config()
SKILL_ROOT = skill_config.resolve_skill_root(_cfg)
if str(SKILL_ROOT) not in sys.path:
    sys.path.insert(0, str(SKILL_ROOT))               # skill 包被分离到其他目录时
STATIC = skill_config.resolve_static_dir(_cfg, APP_DIR)

# frozen 时把 memory 文件默认放到 exe 同级 data/ 下（用户可编辑、可备份）
_mem_cfg = (_cfg.get("memory") or {})
_mem_path_cfg = (_mem_cfg.get("path") or "auto")
if FROZEN and (_mem_path_cfg in ("auto", "", None)):
    os.environ["OLIVIA_MEMORY"] = str(_WRITABLE_ROOT / "data" / "memory.json")
elif _mem_path_cfg not in ("auto", "", None) and not os.environ.get("OLIVIA_MEMORY"):
    # 相对路径一律相对 config 文件所在目录解析
    base = _cfg_file.parent if _cfg_file else _BOOT_ROOT
    p = Path(_mem_path_cfg).expanduser()
    if not p.is_absolute():
        p = base / p
    os.environ["OLIVIA_MEMORY"] = str(p.resolve())

from skill import loader, local_engine, model_client  # noqa: E402,E501
from skill import memory_bank                          # noqa: E402,E501

HOST = os.environ.get("HOST", str(_cfg.get("host", "0.0.0.0")))
PORT = int(os.environ.get("PORT", _cfg.get("port", 8000)))
REPLY_SETTINGS = skill_config.reply_settings(_cfg)

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}


def _now_slot() -> str:
    h = datetime.now().hour
    if 5 <= h < 9:
        return "清晨"
    if 9 <= h < 12:
        return "上午"
    if 12 <= h < 17:
        return "午后"
    if 17 <= h < 21:
        return "傍晚"
    return "深夜"


def _record_memory(user_text: str, result: dict) -> None:
    """把这一轮回信写入分级记忆（失败时不影响回信流程）。"""
    try:
        memory_bank.record_exchange(
            user_text=user_text,
            reply=result.get("reply", ""),
            weather=result.get("weather"),
            mood=result.get("mood"),
            engine=result.get("engine", "local-persona"),
        )
    except Exception:
        traceback.print_exc()


def handle_letter(payload: dict) -> tuple[int, dict]:
    text = (payload.get("text") or "").strip()
    if not text:
        return 400, {"error": "信的内容不能为空"}
    if len(text) > 4000:
        text = text[:4000]

    force = str(payload.get("force") or "auto").strip().lower()
    if force not in ("auto", "model", "local"):
        force = "auto"

    t0 = time.time()
    result: dict | None = None
    engine = "local-persona"

    # force=local: 跳过模型探测，直接用本地人格引擎
    if force == "local":
        _user_digest = text.strip().replace("\n", " ")[:40]
        mem_echo = memory_bank.memory_echo(exclude_digest=_user_digest)
        result = dict(local_engine.respond(text, memory_echo=mem_echo))
        engine = "local-persona"
    else:
        # force=auto/model: 模型可达才走真实调用
        if model_client.model_available():
            mem_ctx = memory_bank.render_context()
            system = loader.build_system_prompt(time_hint=_now_slot(), memory_context=mem_ctx)
            out = model_client.ask_model(system, text)
            if out and out.strip():
                result = {"reply": out.strip()}
                engine = "model"

        # force=model 时若模型没响应（端点不通 / 拉取失败），直接 503
        if result is None:
            if force == "model":
                return 503, {
                    "error": (
                        f"模型端点未连通（{model_client.ENDPOINT}），无法用模型重生成。"
                        "请先启动本地模型服务，或把 force 改为 auto / local。"
                    ),
                    "endpoint": model_client.ENDPOINT,
                    "genai_loaded": model_client.GENAI_LOADED,
                }
            # force=auto: 降级到本地人格引擎
            _user_digest = text.strip().replace("\n", " ")[:40]
            mem_echo = memory_bank.memory_echo(exclude_digest=_user_digest)
            result = dict(local_engine.respond(text, memory_echo=mem_echo))
            engine = "local-persona"

    # 元信息补齐（模型路径下由来信情绪推断）
    weather, mood = local_engine.meta_for(text)
    result.setdefault("weather", weather)
    result.setdefault("mood", mood)
    result["engine"] = engine
    result["ms"] = int((time.time() - t0) * 1000)

    # 写记忆：每条都记，model / local / auto 都算
    _record_memory(text, result)
    return 200, result


class Handler(BaseHTTPRequestHandler):
    server_version = "LinLiMailbox/1.0"

    def log_message(self, fmt: str, *args) -> None:  # 安静一点
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def _send(self, code: int, body, ctype: str = "text/plain; charset=utf-8",
              extra: dict | None = None) -> None:
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if data:
            self.wfile.write(data)

    def do_OPTIONS(self) -> None:  # type: ignore
        self._send(204, "", extra={
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        })

    def _memory_payload(self) -> dict:
        try:
            data = memory_bank.load()
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "path": memory_bank.resolve_memory_path()}
        return {
            "ok": True,
            "path": str(memory_bank.resolve_memory_path()),
            "total_letters": data.get("total_letters", 0),
            "first_letter": data.get("first_letter"),
            "long_term": memory_bank.long_term(data),
            "episodes": data.get("episodes", [])[-10:],   # 最近 10 条
        }

    def do_GET(self) -> None:  # type: ignore
        path = urlparse(self.path).path
        if path == "/api/status":
            payload = {
                **model_client.status(),
                "skill_root": str(SKILL_ROOT),
                "static_dir": str(STATIC),
                "config_file": str(_cfg_file) if _cfg_file else "defaults",
                "reply": REPLY_SETTINGS,
                "memory": {
                    "path": str(memory_bank.resolve_memory_path()),
                    "exists": memory_bank.resolve_memory_path().is_file(),
                    "total_letters": memory_bank.total_letters(),
                },
                "frozen": FROZEN,
            }
            return self._send(200, json.dumps(payload, ensure_ascii=False),
                              "application/json; charset=utf-8")
        if path == "/api/health":
            return self._send(200, '{"ok":true}', "application/json; charset=utf-8")
        if path == "/api/memory":
            return self._send(200, json.dumps(self._memory_payload(), ensure_ascii=False),
                              "application/json; charset=utf-8")
        if path.startswith("/api/"):
            return self._send(404, json.dumps({"error": "Not found"}, ensure_ascii=False),
                              "application/json; charset=utf-8")

        if path == "/":
            path = "/index.html"
        fp = (STATIC / path.lstrip("/")).resolve()
        if not str(fp).startswith(str(STATIC.resolve())) or not fp.is_file():
            return self._send(404, "404 Not Found")
        return self._send(200, fp.read_bytes(), MIME.get(fp.suffix, "application/octet-stream"))

    def do_POST(self) -> None:  # type: ignore
        path = urlparse(self.path).path
        try:
            n = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(n).decode("utf-8") if n else "{}"
            payload = json.loads(raw or "{}")
        except Exception:
            return self._send(400, json.dumps({"error": "JSON 解析失败"}, ensure_ascii=False),
                              "application/json; charset=utf-8")

        if path == "/api/letter":
            try:
                code, data = handle_letter(payload)
            except Exception:
                traceback.print_exc()
                code, data = 500, {"error": "信没寄出去，请再试一次。"}
            return self._send(code, json.dumps(data, ensure_ascii=False),
                              "application/json; charset=utf-8")

        if path == "/api/memory":
            try:
                if bool(payload.get("reset")):
                    memory_bank.reset()
                return self._send(200, json.dumps(self._memory_payload(), ensure_ascii=False),
                                  "application/json; charset=utf-8")
            except Exception as exc:  # noqa: BLE001
                return self._send(500, json.dumps({"error": str(exc)}, ensure_ascii=False),
                                  "application/json; charset=utf-8")

        return self._send(404, json.dumps({"error": "Not found"}, ensure_ascii=False),
                          "application/json; charset=utf-8")


def main() -> None:
    if not (SKILL_ROOT / "persona" / "olivia_lin.md").is_file():
        raise SystemExit(
            f"在 skill_root 找不到语料: {SKILL_ROOT / 'persona' / 'olivia_lin.md'}\n"
            f"请在 config.json 中设置 skill_root（或设置环境变量 OLIVIA_SKILL_ROOT）。"
        )

    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    up = model_client.model_available()
    mem_path = memory_bank.resolve_memory_path()
    print("===========================================================")
    print(f"林离的信箱已就绪  →  http://{HOST}:{PORT}")
    print(f"配置: {_cfg_file if _cfg_file else '内置默认（无 config.json）'}")
    print(f"skill_root: {SKILL_ROOT}")
    print(f"static_dir: {STATIC}")
    print(f"模型空壳: {model_client.ENDPOINT} (model={model_client.MODEL}) "
          f"up={up} genai_loaded={model_client.GENAI_LOADED}")
    print(f"记忆库: {mem_path}  (已记录 {memory_bank.total_letters()} 封)")
    if FROZEN:
        print("frozen mode: 资源位于 sys._MEIPASS，配置 / 记忆可放在 exe 同级目录")
    print("端点不可达时将自动降级为本地人格引擎 (skill/local_engine.py)")
    print("===========================================================")

    # 启动后自动打开浏览器（可由 open_browser: false / OLIVIA_BROWSER=0 关闭）
    open_browser = bool(_cfg.get("open_browser", FROZEN))
    if open_browser and os.environ.get("OLIVIA_BROWSER", "1") not in ("0", "false", "False"):
        def _open():
            try:
                webbrowser.open(f"http://127.0.0.1:{PORT}/")
            except Exception:
                pass
        threading.Timer(0.6, _open).start()

    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
