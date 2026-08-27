"""多协议兼容模型客户端（OpenAI / Gemini / Anthropic / Auto）。

支持各大主流大模型协议与生态：
1. OpenAI 兼容协议（最通用：OpenAI 官方、DeepSeek、Qwen、OneAPI/NewAPI、Ollama、LM Studio、vLLM）
   POST <endpoint>/v1/chat/completions
2. Google Gemini 协议（官方 API 及本地 Gemini 空壳代理）
   POST <endpoint>/v1beta/models/<model>:generateContent 或 google-generativeai SDK
3. Anthropic 协议（Claude 原生格式）
   POST <endpoint>/v1/messages
4. Auto 模式：根据端点 URL 与模型名称自动推断对应协议。

行为约定：
- 端点可达且调用成功  → 返回模型生成的文本字符串；
- 端点不可达 / 鉴权失败 / 超时 / 异常 → 返回 None，自动降级到 local_engine 本地人格引擎；
- 绝不让请求挂死或报错。
"""
from __future__ import annotations

import json
import os
import socket
import urllib.parse
import urllib.request
from typing import Any
from urllib.parse import urlparse

from skill import config as _skill_config

# ---------- 配置加载 ----------
_cfg = _skill_config.load_config()[0]
_m = _cfg.get("model", {})
PROTOCOL = os.environ.get("OLIVIA_PROTOCOL", str(_m.get("protocol", "auto"))).strip().lower()
API_KEY = os.environ.get("OLIVIA_API_KEY", str(_m.get("api_key", "test")))
ENDPOINT = os.environ.get("OLIVIA_ENDPOINT", str(_m.get("endpoint", "http://127.0.0.1:8045")))
MODEL = os.environ.get("OLIVIA_MODEL", str(_m.get("model", "gemini-2.5-flash")))
TIMEOUT = float(os.environ.get("OLIVIA_TIMEOUT", _m.get("timeout", 15)))

GENAI_LOADED = False
GENAI_ERROR = ""
genai = None

try:
    import google.generativeai as _genai
    genai = _genai
    GENAI_LOADED = True
except Exception as e:
    GENAI_ERROR = str(e)


def _detect_protocol(proto: str, endpoint: str, model_name: str) -> str:
    """推断实际生效的协议类型（openai / gemini / anthropic）。"""
    proto = (proto or "auto").strip().lower()
    if proto in ("openai", "gemini", "anthropic"):
        return proto

    ep_lower = endpoint.lower()
    m_lower = model_name.lower()

    if "anthropic" in ep_lower or "claude" in m_lower:
        return "anthropic"
    if "googleapis" in ep_lower or ":8045" in ep_lower or (m_lower.startswith("gemini") and "v1/chat" not in ep_lower):
        return "gemini"
    if "chat/completions" in ep_lower or "openai" in ep_lower or "deepseek" in ep_lower or "qwen" in m_lower or "gpt" in m_lower:
        return "openai"

    return "openai" if ("https://" in ep_lower or "http://" in ep_lower) and ":8045" not in ep_lower else "gemini"


def _parse_host_port(endpoint: str) -> tuple[str, int]:
    u = urlparse(endpoint)
    host = u.hostname or "127.0.0.1"
    if u.port:
        port = u.port
    elif u.scheme == "https":
        port = 443
    else:
        port = 80
    return host, port


HOST, PORT = _parse_host_port(ENDPOINT)


def reconfigure(cfg: dict | None = None) -> dict:
    """动态热重载模型配置。"""
    global PROTOCOL, API_KEY, ENDPOINT, MODEL, TIMEOUT, HOST, PORT, genai, GENAI_LOADED, GENAI_ERROR
    if cfg is None:
        cfg, _ = _skill_config.load_config(reload=True)
    m = cfg.get("model", {})
    PROTOCOL = os.environ.get("OLIVIA_PROTOCOL", str(m.get("protocol", "auto"))).strip().lower()
    API_KEY = os.environ.get("OLIVIA_API_KEY", str(m.get("api_key", "test")))
    ENDPOINT = os.environ.get("OLIVIA_ENDPOINT", str(m.get("endpoint", "http://127.0.0.1:8045")))
    MODEL = os.environ.get("OLIVIA_MODEL", str(m.get("model", "gemini-2.5-flash")))
    TIMEOUT = float(os.environ.get("OLIVIA_TIMEOUT", m.get("timeout", 15)))

    HOST, PORT = _parse_host_port(ENDPOINT)

    # 尝试配置 SDK（如果为 Gemini）
    if genai and (_detect_protocol(PROTOCOL, ENDPOINT, MODEL) == "gemini"):
        try:
            genai.configure(
                api_key=API_KEY,
                transport="rest",
                client_options={"api_endpoint": ENDPOINT}
            )
            GENAI_LOADED = True
            GENAI_ERROR = ""
        except Exception as e:
            GENAI_ERROR = str(e)

    return status()


def model_available() -> bool:
    """端点是否可达（TCP 探活，0.8s 内）。"""
    try:
        socket.create_connection((HOST, PORT), timeout=0.8).close()
        return True
    except OSError:
        return False


# ---------------------------------------------------------------- 协议适配调用实现

def _call_openai(endpoint: str, api_key: str, model_name: str, system: str,
                 user_text: str, timeout: float) -> str | None:
    """OpenAI 格式调用 (/v1/chat/completions)。"""
    base = endpoint.rstrip("/")
    if not base.endswith("/chat/completions"):
        if base.endswith("/v1"):
            url = f"{base}/chat/completions"
        else:
            url = f"{base}/v1/chat/completions"
    else:
        url = base

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key or 'test'}",
        "User-Agent": "BSide-Olivia-Client/1.0",
    }
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_text},
        ],
        "temperature": 0.7,
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        choices = data.get("choices") or []
        if choices:
            msg = choices[0].get("message") or {}
            return str(msg.get("content") or "").strip()
    return None


def _call_anthropic(endpoint: str, api_key: str, model_name: str, system: str,
                    user_text: str, timeout: float) -> str | None:
    """Anthropic 格式调用 (/v1/messages)。"""
    base = endpoint.rstrip("/")
    if not base.endswith("/messages"):
        if base.endswith("/v1"):
            url = f"{base}/messages"
        else:
            url = f"{base}/v1/messages"
    else:
        url = base

    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key or "test",
        "anthropic-version": "2023-06-01",
        "User-Agent": "BSide-Olivia-Client/1.0",
    }
    payload = {
        "model": model_name,
        "system": system,
        "messages": [
            {"role": "user", "content": user_text},
        ],
        "max_tokens": 2048,
        "temperature": 0.7,
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        contents = data.get("content") or []
        texts = [c.get("text", "") for c in contents if c.get("type") == "text"]
        if texts:
            return "".join(texts).strip()
    return None


def _call_gemini(endpoint: str, api_key: str, model_name: str, system: str,
                 user_text: str, timeout: float) -> str | None:
    """Gemini 格式调用（优先 REST，兼容 SDK）。"""
    # 1. 尝试直接 REST API 调用
    try:
        base = endpoint.rstrip("/")
        if "generateContent" not in base:
            url = f"{base}/v1beta/models/{model_name}:generateContent?key={urllib.parse.quote(api_key or 'test')}"
        else:
            url = base

        headers = {"Content-Type": "application/json"}
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user_text}]}],
            "generationConfig": {"temperature": 0.7},
        }
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates") or []
            if candidates:
                parts = ((candidates[0].get("content") or {}).get("parts") or [])
                if parts:
                    return str(parts[0].get("text") or "").strip()
    except Exception:
        pass

    # 2. 回退到 google-generativeai SDK（如果存在）
    if genai:
        try:
            m = genai.GenerativeModel(model_name)
            resp = m.generate_content([
                {"role": "user", "parts": [{"text": system}]},
                {"role": "user", "parts": [{"text": user_text}]},
            ])
            return str(resp.text).strip()
        except Exception:
            pass

    return None


def ask_model(system: str, user_text: str, timeout: float | None = None) -> str | None:
    """多协议自动适配调用模型。任何失败或异常均返回 None（由上层平滑降级）。"""
    active_proto = _detect_protocol(PROTOCOL, ENDPOINT, MODEL)
    t = timeout or TIMEOUT

    try:
        if active_proto == "openai":
            res = _call_openai(ENDPOINT, API_KEY, MODEL, system, user_text, t)
            if res:
                return res
        elif active_proto == "anthropic":
            res = _call_anthropic(ENDPOINT, API_KEY, MODEL, system, user_text, t)
            if res:
                return res
        elif active_proto == "gemini":
            res = _call_gemini(ENDPOINT, API_KEY, MODEL, system, user_text, t)
            if res:
                return res

        # 兜底交叉尝试：如果指定协议失败，尝试 OpenAI 兼容协议
        if active_proto != "openai":
            res = _call_openai(ENDPOINT, API_KEY, MODEL, system, user_text, min(t, 3.0))
            if res:
                return res
    except Exception:
        return None

    return None


def status() -> dict:
    active_proto = _detect_protocol(PROTOCOL, ENDPOINT, MODEL)
    return {
        "protocol": PROTOCOL,
        "active_protocol": active_proto,
        "endpoint": ENDPOINT,
        "model": MODEL,
        "timeout": TIMEOUT,
        "genai_loaded": GENAI_LOADED,
        "genai_error": GENAI_ERROR,
        "model_up": model_available(),
    }
