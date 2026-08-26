"""模型空壳客户端（响应式）。

按用户指定的方式配置 google-generativeai，指向本地模型端点（默认 http://127.0.0.1:8045，
可在 config.json 的 model 段修改）：

    import google.generativeai as genai
    genai.configure(
        api_key="test",
        transport='rest',
        client_options={'api_endpoint': 'http://127.0.0.1:8045'}
    )

行为约定（"空壳"语义）：
- 端点可达  → 走真实模型调用（带超时保护，默认 15s）；
- 端点不可达 / 调用失败 / 未安装 google-generativeai → 返回 None，
  由上层（app/server.py）自动降级到 local_engine 本地人格引擎。
因此本模块永远不会让请求挂死或报错。

参数优先级：环境变量（OLIVIA_*）> config.json > 内置默认。
"""
from __future__ import annotations

import os
import socket
from urllib.parse import urlparse

from skill import config as _skill_config

# ---------- 按用户指定的方式配置（值来自 config.json / 环境变量） ----------
_cfg = _skill_config.load_config()[0]
_m = _cfg.get("model", {})
API_KEY = os.environ.get("OLIVIA_API_KEY", str(_m.get("api_key", "test")))
ENDPOINT = os.environ.get("OLIVIA_ENDPOINT", str(_m.get("endpoint", "http://127.0.0.1:8045")))
MODEL = os.environ.get("OLIVIA_MODEL", str(_m.get("model", "gemini-2.5-flash")))
TIMEOUT = float(os.environ.get("OLIVIA_TIMEOUT", _m.get("timeout", 15)))

try:
    import google.generativeai as genai

    genai.configure(
        api_key=API_KEY,
        transport='rest',
        client_options={'api_endpoint': ENDPOINT}
    )
    GENAI_LOADED = True
    GENAI_ERROR = ""
except Exception as e:  # 未安装或配置失败都不影响降级
    genai = None
    GENAI_LOADED = False
    GENAI_ERROR = str(e)

_u = urlparse(ENDPOINT)
HOST = _u.hostname or "127.0.0.1"
PORT = _u.port or 8045


def model_available() -> bool:
    """端点是否可达（TCP 探活，0.8s 内）。"""
    try:
        socket.create_connection((HOST, PORT), timeout=0.8).close()
        return True
    except OSError:
        return False


def ask_model(system: str, user_text: str, timeout: float | None = None) -> str | None:
    """调用模型。任何失败都返回 None（由上层降级）。"""
    if not GENAI_LOADED:
        return None

    import concurrent.futures

    def _call() -> str:
        model = genai.GenerativeModel(MODEL)
        resp = model.generate_content([
            {"role": "user", "parts": [{"text": system}]},
            {"role": "user", "parts": [{"text": user_text}]},
        ])
        return resp.text

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(_call)
            return fut.result(timeout=timeout or TIMEOUT)
    except Exception:
        return None


def status() -> dict:
    return {
        "endpoint": ENDPOINT,
        "model": MODEL,
        "timeout": TIMEOUT,
        "genai_loaded": GENAI_LOADED,
        "genai_error": GENAI_ERROR,
        "model_up": model_available(),
    }
