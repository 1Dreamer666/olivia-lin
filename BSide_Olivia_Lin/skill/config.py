"""配置加载与路径解析 —— 项目"住在哪"的唯一入口（路径解耦）。

设计目标：
- `python <任意路径>/app/server.py` 与项目放在哪个目录无关；
- skill 包 / persona 语料 / 静态资源 / 模型端点 / 回信节奏 全部可用 config.json 修改；
- config.json 可选：不存在时使用内置默认值（等价于默认目录布局，向后兼容）。

配置文件查找顺序（命中即停）：
1. 环境变量 OLIVIA_CONFIG（显式指定的 config.json 路径）
2. 本 skill 包上两级的 config.json（项目自带配置，优先）
3. 当前工作目录的 config.json

相对路径规则：config 内的相对路径一律相对「config 文件所在目录」解析（而不是 cwd），
因此无论从哪里运行，含义都不变。值为 "auto" 表示使用默认布局。
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

_PKG_DIR = Path(__file__).resolve().parent    # .../BSide_Olivia_Lin/skill
_PKG_ROOT = _PKG_DIR.parent                    # .../BSide_Olivia_Lin（默认 skill 根）

DEFAULTS: dict[str, Any] = {
    "host": "0.0.0.0",
    "port": 8000,
    "open_browser": True,
    # 包含 skill/、persona/、samples/ 的目录（"项目根"）。
    # "auto" = 本 skill 包的上级目录；可写相对/绝对路径。
    "skill_root": "auto",
    # 网页静态资源目录（index.html / css / js）。
    # "auto" = app/static（与 server.py 同级）；可写相对/绝对路径。
    "static_dir": "auto",
    "model": {
        "api_key": "test",
        "endpoint": "http://127.0.0.1:8045",
        "model": "gemini-2.5-flash",
        "timeout": 15,
    },
    "memory": {
        "path": "auto",
        "admin_password": "123456",
    },
    "reply": {
        "min_reading_ms": 3200,      # 前端"读信"最短等待（保留书信节奏感）
        "max_letters_per_day": 3,    # 每日信件上限（游戏规则，前端可演示放开）
    },
}


def _deep_merge(base: dict, override: dict | None) -> dict:
    out = dict(base)
    for k, v in (override or {}).items():
        if str(k).startswith("_"):            # "_readme" 之类的说明键忽略
            continue
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _candidate_config_paths() -> list[Path]:
    cands: list[Path] = []
    env = os.environ.get("OLIVIA_CONFIG")
    if env:
        cands.append(Path(env).expanduser())
    if getattr(sys, "frozen", False):
        cands.append(Path(sys.executable).resolve().parent / "config.json")
    cands.append(_PKG_ROOT / "config.json")   # 项目自带配置
    cands.append(Path.cwd() / "config.json")  # 工作目录
    return cands


_CONFIG_CACHE: tuple[dict, Path | None] | None = None


def load_config(reload: bool = False) -> tuple[dict, Path | None]:
    """返回 (配置, 实际使用的配置文件路径)。找不到配置时返回 (内置默认, None)。"""
    global _CONFIG_CACHE
    if _CONFIG_CACHE is not None and not reload:
        return _CONFIG_CACHE
    for cand in _candidate_config_paths():
        try:
            if cand.is_file():
                data = json.loads(cand.read_text(encoding="utf-8"))
                cfg = _deep_merge(DEFAULTS, data)
                _CONFIG_CACHE = (cfg, cand.resolve())
                return _CONFIG_CACHE
        except (OSError, json.JSONDecodeError):
            continue  # 损坏的配置按不存在处理
    _CONFIG_CACHE = (dict(DEFAULTS), None)
    return _CONFIG_CACHE


def get_writable_config_path() -> Path:
    """获取用于写入/持久化配置的目标路径。"""
    env = os.environ.get("OLIVIA_CONFIG")
    if env:
        return Path(env).expanduser().resolve()
    for cand in _candidate_config_paths():
        if cand.is_file():
            return cand.resolve()
    if getattr(sys, "frozen", False):
        return (Path(sys.executable).resolve().parent / "config.json").resolve()
    return (_PKG_ROOT / "config.json").resolve()


def save_config(new_data: dict) -> tuple[dict, Path]:
    """合并并保存配置到磁盘，并刷新缓存。"""
    target = get_writable_config_path()
    target.parent.mkdir(parents=True, exist_ok=True)

    current, _ = load_config(reload=True)
    merged = _deep_merge(current, new_data)

    target.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    os.environ["OLIVIA_CONFIG"] = str(target)
    return load_config(reload=True)


def reset_config() -> tuple[dict, Path]:
    """重置为默认配置并保存。"""
    target = get_writable_config_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(DEFAULTS, ensure_ascii=False, indent=2), encoding="utf-8")
    os.environ["OLIVIA_CONFIG"] = str(target)
    return load_config(reload=True)


def _resolve_path(value: str, base: Path) -> Path:
    p = Path(str(value)).expanduser()
    if not p.is_absolute():
        p = base / p
    return p.resolve()


def resolve_skill_root(cfg: dict | None = None) -> Path:
    """包含 skill/、persona/、samples/ 的目录。

    优先级：环境变量 OLIVIA_SKILL_ROOT > config.skill_root >
    默认（本 skill 包的上级目录）。
    """
    if cfg is None:
        cfg, _ = load_config()
    env = os.environ.get("OLIVIA_SKILL_ROOT")
    if env:
        return _resolve_path(env, Path.cwd())
    value = cfg.get("skill_root", "auto")
    if value in ("auto", "", None):
        return _PKG_ROOT
    _, cfg_file = load_config()
    base = cfg_file.parent if cfg_file else Path.cwd()
    return _resolve_path(str(value), base)


def resolve_static_dir(cfg: dict | None = None, app_dir: Path | None = None) -> Path:
    """网页静态资源目录。优先级同 resolve_skill_root（"auto" = app/static）。"""
    if cfg is None:
        cfg, _ = load_config()
    value = cfg.get("static_dir", "auto")
    if value not in ("auto", "", None):
        _, cfg_file = load_config()
        base = cfg_file.parent if cfg_file else Path.cwd()
        return _resolve_path(str(value), base)

    # 自动探测各种布局（开发源码目录、PyInstaller onedir/onefile 目录等）
    candidates: list[Path] = []
    if app_dir:
        candidates.extend([app_dir / "static", app_dir / "app" / "static"])
    candidates.extend([
        _PKG_ROOT / "app" / "static",
        _PKG_ROOT / "static",
    ])
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        candidates.extend([
            exe_dir / "_internal" / "app" / "static",
            exe_dir / "_internal" / "static",
            exe_dir / "static",
            exe_dir / "app" / "static",
        ])
    for c in candidates:
        if c.is_dir():
            return c.resolve()
    return (app_dir or (_PKG_ROOT / "app")) / "static"


def reply_settings(cfg: dict | None = None) -> dict:
    if cfg is None:
        cfg, _ = load_config()
    r = cfg.get("reply", {})
    return {
        "min_reading_ms": int(r.get("min_reading_ms", DEFAULTS["reply"]["min_reading_ms"])),
        "max_letters_per_day": int(r.get("max_letters_per_day", DEFAULTS["reply"]["max_letters_per_day"])),
    }
