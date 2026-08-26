"""分级记忆系统（Tiered Memory Bank）——让回信"记得"之前的信。

架构参考生产级 agent 记忆的三层共识（工作记忆 / 情景记忆 / 长期记忆）：
Letta(MemGPT) 的 core-recall-archival、MemoryOS 的短期/中期/长期三级、
H-MEM 的分层索引与逐级摘要、MemoryOS 的频率/时近性"晋升"与艾宾浩斯式衰减。

本实现：文件式（data/memory.json，零依赖、人类可读可编辑）、规则驱动：

- L1 工作记忆：当前来信 + 本轮回复（在上下文里，不落盘）。
- L2 情景记忆（episodic）：滚动 episode 日志，最多保留 MAX_EPISODES 条，
  超出即"遗忘"（最旧的先走）。
- L3 长期记忆（semantic profile）：从 episodes 聚合出的画像——首信日期、
  总信数、主题频率、近期情绪轨迹、关键事件（告别/心动/失眠…）。
  每次写入 episode 时顺带"晋升"（frequency/recency-based promotion）。

用法：
    from skill import memory_bank
    memory_bank.record_exchange(user_text, reply, weather, mood, engine)  # 每封信后
    ctx = memory_bank.render_context()   # 注入 system prompt（模型路径）
    echo = memory_bank.memory_echo()     # 本地引擎用的一句"回声"
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from skill import config as _skill_config
from skill import local_engine as _le

MAX_EPISODES = 30          # L2 容量（超出的最旧记忆被遗忘）
RECENT_IN_PROMPT = 5       # 注入 prompt 的最近情景数
TOPICS_IN_PROMPT = 3       # 长期画像展示的主题数


# ---------------------------------------------------------------- 存储

def resolve_memory_path() -> Path:
    env = os.environ.get("OLIVIA_MEMORY")
    if env:
        return Path(env).expanduser()
    cfg, cfg_file = _skill_config.load_config()
    value = (cfg.get("memory") or {}).get("path", "auto")
    if value not in ("auto", "", None):
        base = cfg_file.parent if cfg_file else _skill_config.resolve_skill_root()
        p = Path(str(value)).expanduser()
        if not p.is_absolute():
            p = base / p
        return p.resolve()
    return _skill_config.resolve_skill_root() / "data" / "memory.json"


def _empty() -> dict:
    return {"episodes": [], "total_letters": 0, "first_letter": None}


def _load() -> dict:
    p = resolve_memory_path()
    try:
        if p.is_file():
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data.setdefault("episodes", [])
                data.setdefault("total_letters", 0)
                data.setdefault("first_letter", None)
                return data
    except (OSError, json.JSONDecodeError):
        pass  # 损坏的记忆按全新处理（不阻断写信）
    return _empty()


def _save(data: dict) -> None:
    p = resolve_memory_path()
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, p)
    except OSError:
        pass  # 记忆写盘失败不阻断写信


# ---------------------------------------------------------------- 写入（L2 → L3 晋升）

def record_exchange(user_text: str, reply: str, weather: str, mood: str,
                    engine: str, now: datetime | None = None) -> dict | None:
    """一封信收信+回信完成后调用。返回新增的 episode（无权限等失败时返回 None）。"""
    now = now or datetime.now()
    a = _le.analyze(user_text)
    data = _load()
    ep = {
        "ts": now.isoformat(timespec="seconds"),
        "date": now.strftime("%Y-%m-%d"),
        "topics": a["topics"][:5],
        "weather": weather,
        "mood": mood,
        "engine": engine,
        "user_digest": (user_text or "").strip().replace("\n", " ")[:40],
        "reply_digest": (reply or "").strip().split("\n\n")[0][:80],
        "farewell": bool(a["farewell"]),
    }
    data["episodes"].append(ep)
    data["episodes"] = data["episodes"][-MAX_EPISODES:]      # 遗忘：最旧先走
    data["total_letters"] = int(data.get("total_letters") or 0) + 1
    if not data.get("first_letter"):
        data["first_letter"] = ep["ts"]
    # L3 晋升：关键事件落进长期记忆
    notables = data.setdefault("notables", {})
    if a["farewell"] and not notables.get("farewell"):
        notables["farewell"] = ep["date"]
    if "love" in a["topics"] and not notables.get("love"):
        notables["love"] = ep["date"]
    _save(data)
    return ep


# ---------------------------------------------------------------- 读取

def _long_term(data: dict) -> dict:
    eps = data.get("episodes", [])
    counts: dict[str, int] = {}
    for e in eps:
        for t in e.get("topics", []):
            counts[t] = counts.get(t, 0) + 1
    top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:TOPICS_IN_PROMPT]
    dates = [e["date"] for e in eps if e.get("date")]
    return {
        "total_letters": int(data.get("total_letters") or 0),
        "first_letter": data.get("first_letter"),
        "top_topics": [{"topic": t, "count": n} for t, n in top],
        "recent_moods": [e.get("mood") for e in eps[-5:]],
        "last_weather": eps[-1].get("weather") if eps else None,
        "days_span": (max(dates) and min(dates) and 1 + (datetime.strptime(max(dates), "%Y-%m-%d")
                   - datetime.strptime(min(dates), "%Y-%m-%d")).days) or 0,
        "notables": data.get("notables", {}),
    }


def get_summary() -> dict:
    data = _load()
    return {
        "path": str(resolve_memory_path()),
        "total_letters": data.get("total_letters", 0),
        "long_term": _long_term(data),
        "recent_episodes": data.get("episodes", [])[-10:],
    }


def reset() -> None:
    try:
        p = resolve_memory_path()
        if p.is_file():
            p.unlink()
    except OSError:
        pass


_TOPIC_ZH = {
    "sad": "难过", "anxiety": "焦虑", "work": "工作", "study": "学业", "love": "心动",
    "thanks": "感谢", "music": "音乐", "weather": "天气", "dream": "方向", "ill": "身体",
    "family": "家人", "friend": "朋友", "food": "吃食", "daily": "日常",
}


def render_context() -> str:
    """生成注入 system prompt 的记忆块（无记忆时返回空串）。"""
    data = _load()
    if not data.get("episodes"):
        return ""
    lt = _long_term(data)
    lines = ["【长期记忆 · 她记得什么】"]
    first = (lt["first_letter"] or "")[:10]
    lines.append(f"- 第一封信：{first}；累计 {lt['total_letters']} 封，跨 {lt['days_span']} 天。")
    if lt["top_topics"]:
        tops = "、".join(f"{_TOPIC_ZH.get(t['topic'], t['topic'])}×{t['count']}" for t in lt["top_topics"])
        lines.append(f"- 你常写的主题：{tops}。")
    if lt["notables"].get("farewell"):
        lines.append(f"- 关键事件：{lt['notables']['farewell']} 你写过告别。")
    if lt["notables"].get("love"):
        lines.append(f"- 关键事件：{lt['notables']['love']} 你写过喜欢一个人。")
    lines.append("")
    lines.append("【近期情景记忆】（只有这些，不得编造其外的记忆）")
    for e in data["episodes"][-RECENT_IN_PROMPT:]:
        topics = "、".join(_TOPIC_ZH.get(t, t) for t in e.get("topics", [])[:3]) or "日常"
        lines.append(f"- {e['date']}（{topics}，她的回复：{e.get('mood', '平静')}）：你写了「{e.get('user_digest', '')}」")
    return "\n".join(lines)


# ---------------------------------------------------------------- 本地引擎用的一句"回声"

_ECHO = {
    "music": "你上次写的那支曲子，我后来还想了想。真的，有些曲子要过很久才对上锁。",
    "work": "你上次说的工作，后来好些了吗？休止就是休止，不用急着把音补上。",
    "sad": "你上次写的那种感觉，应该退了一些吧。情绪像潮水，自己会退，不用追。",
    "anxiety": "上次你说脑子停不下来。这阵子，夜里安静一点了吗？",
    "love": "你上封信里那个人，后来怎么样了。我没催你，现在也不催。",
    "study": "你上次说在弄的那件事，还卡着吗？没首演的曲子不算失败，只是还没轮到。",
    "food": "你上次写的那顿饭，吃得饱吗？好吃的味道，是日子最可靠的证据。",
    "weather": "你上次写天气以后，我也开始常看天了。",
    "ill": "上次你说身体不舒服，现在好了吗？身体有自己的速度，慢一点没关系。",
    "daily": "你上次写的那件小事，我记在本子上了。小事攒起来，就是日子。",
}
_ECHO_DEFAULT = "信写了几封了。我慢慢习惯了这个节奏——你写，我回。"


def memory_echo(exclude_digest: str | None = None) -> str | None:
    """基于最近一条情景记忆生成一句"回声"（本地引擎用）。无记忆返回 None。"""
    data = _load()
    eps = data.get("episodes", [])
    # 跳过与当前来信完全相同的条目（避免"自己回自己"）
    for e in reversed(eps):
        if exclude_digest and e.get("user_digest") == (exclude_digest or "").strip().replace("\n", " ")[:40]:
            continue
        for t in e.get("topics", []):
            if t in _ECHO:
                return _ECHO[t]
        if len(eps) >= 2:
            return _ECHO_DEFAULT
        return None
    return None


if __name__ == "__main__":
    s = get_summary()
    print(json.dumps(s, ensure_ascii=False, indent=2))
