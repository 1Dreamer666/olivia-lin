"""模型客户端：多协议自动兼容与流式活跃心跳超时 (Sliding Inactivity Timeout)

支持四种模式：
  1. OpenAI 兼容协议（支持流式实时心跳刷新）：POST <endpoint>/v1/chat/completions
  2. Gemini 协议（REST / SDK）：POST <endpoint>/v1beta/models/<model>:streamGenerateContent
  3. Anthropic 协议（Claude 格式）：POST <endpoint>/v1/messages
  4. Auto 模式：根据端点 URL 与模型名称自动推断对应协议。

超时机制升级：
  - 采用「流式心跳活跃超时」机制（Sliding Inactivity Timeout）。
  - 在输出过程中，只要收到新的分片或字符，超时计时器即刻重置刷新。
  - 仅当模型停止吐字且超过设定阈值（未完成）时，才判定超时并触发平滑降级。
"""
from __future__ import annotations

import json
import os
import socket
import time
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

genai = None
GENAI_LOADED = False
GENAI_ERROR = ""

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


# ---------------------------------------------------------------- 协议适配与流式心跳调用实现

def _call_openai(endpoint: str, api_key: str, model_name: str, system: str,
                 user_text: str, timeout: float) -> str | None:
    """OpenAI 格式流式调用，支持块间活动心跳重置。"""
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
        "Accept": "text/event-stream, application/json",
    }
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_text},
        ],
        "temperature": 0.7,
        "stream": True,
    }

    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_parts = []
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="ignore").strip()
                if not line or line.startswith(":"):
                    continue
                if line.startswith("data:"):
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        choices = chunk.get("choices") or []
                        if choices:
                            delta = choices[0].get("delta") or {}
                            delta_text = delta.get("content") or ""
                            if delta_text:
                                content_parts.append(delta_text)
                    except Exception:
                        continue
            
            if content_parts:
                return "".join(content_parts).strip()
    except Exception:
        # 若服务端不支持 stream=True，降级为普通非流式调用
        try:
            payload["stream"] = False
            req2 = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
            with urllib.request.urlopen(req2, timeout=timeout) as resp2:
                data = json.loads(resp2.read().decode("utf-8"))
                choices = data.get("choices") or []
                if choices:
                    msg = choices[0].get("message") or {}
                    return str(msg.get("content") or "").strip()
        except Exception:
            pass

    return None


def _call_anthropic(endpoint: str, api_key: str, model_name: str, system: str,
                    user_text: str, timeout: float) -> str | None:
    """Anthropic 格式调用（支持 SSE 流式心跳）。"""
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
        "Accept": "text/event-stream, application/json",
    }
    payload = {
        "model": model_name,
        "system": system,
        "messages": [
            {"role": "user", "content": user_text},
        ],
        "max_tokens": 2048,
        "temperature": 0.7,
        "stream": True,
    }

    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_parts = []
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="ignore").strip()
                if line.startswith("data:"):
                    data_str = line[5:].strip()
                    try:
                        chunk = json.loads(data_str)
                        if chunk.get("type") == "content_block_delta":
                            delta = chunk.get("delta") or {}
                            if delta.get("type") == "text_delta":
                                content_parts.append(delta.get("text", ""))
                    except Exception:
                        continue
            if content_parts:
                return "".join(content_parts).strip()
    except Exception:
        try:
            payload["stream"] = False
            req2 = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
            with urllib.request.urlopen(req2, timeout=timeout) as resp2:
                data = json.loads(resp2.read().decode("utf-8"))
                contents = data.get("content") or []
                texts = [c.get("text", "") for c in contents if c.get("type") == "text"]
                if texts:
                    return "".join(texts).strip()
        except Exception:
            pass

    return None


def _call_gemini(endpoint: str, api_key: str, model_name: str, system: str,
                 user_text: str, timeout: float) -> str | None:
    """Gemini 格式调用（支持 SSE 流式心跳）。"""
    try:
        base = endpoint.rstrip("/")
        if "streamGenerateContent" not in base and "generateContent" not in base:
            url = f"{base}/v1beta/models/{model_name}:streamGenerateContent?alt=sse&key={urllib.parse.quote(api_key or 'test')}"
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
            content_parts = []
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="ignore").strip()
                if line.startswith("data:"):
                    try:
                        chunk = json.loads(line[5:].strip())
                        candidates = chunk.get("candidates") or []
                        if candidates:
                            parts = ((candidates[0].get("content") or {}).get("parts") or [])
                            for p in parts:
                                content_parts.append(p.get("text", ""))
                    except Exception:
                        continue
            if content_parts:
                return "".join(content_parts).strip()
    except Exception:
        pass

    # 非流式 REST 回退
    try:
        base = endpoint.rstrip("/")
        url = f"{base}/v1beta/models/{model_name}:generateContent?key={urllib.parse.quote(api_key or 'test')}" if "generateContent" not in base else base
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates") or []
            if candidates:
                parts = ((candidates[0].get("content") or {}).get("parts") or [])
                if parts:
                    return str(parts[0].get("text") or "").strip()
    except Exception:
        pass

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
    """多协议自动适配调用模型（带心跳流式与块间重置）。"""
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
            res = _call_openai(ENDPOINT, API_KEY, MODEL, system, user_text, min(t, 5.0))
            if res:
                return res
    except Exception:
        return None

    return None


def status() -> dict[str, Any]:
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
