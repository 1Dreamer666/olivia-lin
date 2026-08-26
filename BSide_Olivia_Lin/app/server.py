#!/usr/bin/env python3
"""BSide · 林离的信箱 —— 零依赖演示服务器（stdlib only）

路由：
  GET  /               静态页（static/）
  GET  /api/status     模型空壳状态（端点探活 + genai 加载情况）
  POST /api/letter     {"text": "来信正文"} → {"reply","weather","mood","engine","ms"}

行为：
  模型端点（默认 http://127.0.0.1:8045，可用 OLIVIA_ENDPOINT 覆盖）可达时，
  用 skill/loader 组装的 system prompt 走真实调用；不可达时自动降级到
  skill/local_engine 本地人格引擎 —— 页面永远"有回音"。

运行：
  python3 server.py            # 默认 http://0.0.0.0:8000
  PORT=9000 python3 server.py  # 自定义端口
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))

from skill import loader, local_engine, model_client  # noqa: E402

PORT = int(os.environ.get("PORT", "8000"))
HOST = os.environ.get("HOST", "0.0.0.0")
STATIC = ROOT / "static"

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


def handle_letter(payload: dict) -> tuple[int, dict]:
    text = (payload.get("text") or "").strip()
    if not text:
        return 400, {"error": "信的内容不能为空"}
    if len(text) > 4000:
        text = text[:4000]

    t0 = time.time()
    result: dict | None = None
    engine = "local-persona"

    # 1) 模型空壳：端点可达才走真实调用
    if model_client.model_available():
        system = loader.build_system_prompt(time_hint=_now_slot())
        out = model_client.ask_model(system, text)
        if out and out.strip():
            result = {"reply": out.strip()}
            engine = "model"

    # 2) 降级：本地人格引擎
    if result is None:
        result = dict(local_engine.respond(text))
        engine = "local-persona"

    # 元信息补齐（模型路径下由来信情绪推断）
    weather, mood = local_engine.meta_for(text)
    result.setdefault("weather", weather)
    result.setdefault("mood", mood)
    result["engine"] = engine
    result["ms"] = int((time.time() - t0) * 1000)
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

    def do_GET(self) -> None:  # type: ignore
        path = urlparse(self.path).path
        if path == "/api/status":
            return self._send(200, json.dumps(model_client.status(), ensure_ascii=False),
                              "application/json; charset=utf-8")
        if path == "/api/health":
            return self._send(200, '{"ok":true}', "application/json; charset=utf-8")
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
        if path != "/api/letter":
            return self._send(404, json.dumps({"error": "Not found"}, ensure_ascii=False),
                              "application/json; charset=utf-8")
        try:
            n = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        except Exception:
            return self._send(400, json.dumps({"error": "JSON 解析失败"}, ensure_ascii=False),
                              "application/json; charset=utf-8")
        try:
            code, data = handle_letter(payload)
        except Exception:
            traceback.print_exc()
            code, data = 500, {"error": "信没寄出去，请再试一次。"}
        return self._send(code, json.dumps(data, ensure_ascii=False),
                          "application/json; charset=utf-8")


def main() -> None:
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    up = model_client.model_available()
    print(f"林离的信箱已就绪  →  http://{HOST}:{PORT}")
    print(f"模型空壳: {model_client.ENDPOINT} (model={model_client.MODEL}) "
          f"up={up} genai_loaded={model_client.GENAI_LOADED}")
    print("端点不可达时将自动降级为本地人格引擎 (skill/local_engine.py)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
