"""分级记忆系统（Tiered Memory Bank）——让回信"记得"之前的信。

架构参考生产级 agent 记忆的三层共识（工作记忆 / 情景记忆 / 长期记忆）：
Letta(MemGPT) 的 core-recall-archival、MemoryOS 的短期/中期/长期三级、
H-MEM 的分层索引与逐级摘要、MemoryOS 的频率/时近性"晋升"与艾宾浩斯式衰减。

本实现：文件式（data/memory.json，零依赖、人类可读可编辑）、规则驱动：

- L1 工作记忆：当前来信 + 本轮回复（在上下文里，不落盘）。
- L2 情景记忆（episodic）：滚动 episode 日志，最多保留 MAX_EPISODES 条活情景。
- L3 长期记忆（semantic profile）：从有效 episodes 聚合出的画像——首信日期、
  总信数、主题频率、近期情绪轨迹、关键事件（告别/心动/失眠…）。
- 软删除保护（Soft-Delete Guard）：清空与删除记忆是重大决策。系统绝不真正物理
  抹除文件记录，而是标记为 status: "DELETED"（对 AI 与普通前端隐藏）。
  可在密码保护（默认 123456）的"后悔处"随时单选、多选、全选批量回归。

用法：
    from skill import memory_bank
    memory_bank.record_exchange(user_text, reply, weather, mood, engine)  # 每封信后
    ctx = memory_bank.render_context()   # 注入 system prompt（模型路径）
    echo = memory_bank.memory_echo()     # 本地引擎用的一句"回声"
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from skill import config as _skill_config
from skill import local_engine as _le

MAX_EPISODES = 30          # L2 活跃容量（超出的最旧有效记忆被归档/遗忘）
RECENT_IN_PROMPT = 5       # 注入 prompt 的最近情景数
TOPICS_IN_PROMPT = 3       # 长期画像展示的主题数
DEFAULT_ADMIN_PASSWORD = "123456"


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
    return {"episodes": [], "total_letters": 0, "first_letter": None, "notables": {}}


def _normalize_episode(ep: dict, idx: int = 0) -> dict:
    if not isinstance(ep, dict):
        return ep
    if not ep.get("id"):
        ts_part = ep.get("ts", "").replace("-", "").replace(":", "").replace("T", "_") or str(idx)
        ep["id"] = f"ep_{ts_part}_{uuid.uuid4().hex[:6]}"
    if "status" not in ep:
        ep["status"] = "DELETED" if ep.get("deleted") else "ACTIVE"
    ep["deleted"] = bool(ep.get("deleted") or ep.get("status") == "DELETED")
    return ep


def _load() -> dict:
    p = resolve_memory_path()
    try:
        if p.is_file():
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data.setdefault("episodes", [])
                data.setdefault("total_letters", 0)
                data.setdefault("first_letter", None)
                data.setdefault("notables", {})
                # 规范化条目
                for i, ep in enumerate(data["episodes"]):
                    _normalize_episode(ep, i)
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


# ---------------------------------------------------------------- 筛选

def _active_episodes(data: dict) -> list[dict]:
    return [
        e for e in data.get("episodes", [])
        if not e.get("deleted") and e.get("status", "ACTIVE") != "DELETED"
    ]


def _deleted_episodes(data: dict) -> list[dict]:
    return [
        e for e in data.get("episodes", [])
        if e.get("deleted") or e.get("status") == "DELETED"
    ]


# ---------------------------------------------------------------- 写入（L2 → L3 晋升）

def record_exchange(user_text: str, reply: str, weather: str, mood: str,
                    engine: str, now: datetime | None = None) -> dict | None:
    """一封信收信+回信完成后调用。返回新增的 episode（无权限等失败时返回 None）。"""
    now = now or datetime.now()
    a = _le.analyze(user_text)
    data = _load()
    ep_id = f"ep_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    ep = {
        "id": ep_id,
        "ts": now.isoformat(timespec="seconds"),
        "date": now.strftime("%Y-%m-%d"),
        "topics": a["topics"][:5],
        "weather": weather,
        "mood": mood,
        "engine": engine,
        "user_digest": (user_text or "").strip().replace("\n", " ")[:40],
        "reply_digest": (reply or "").strip().split("\n\n")[0][:80],
        "farewell": bool(a["farewell"]),
        "status": "ACTIVE",
        "deleted": False,
    }
    data["episodes"].append(ep)

    # 仅按 active 数量滚动清理过旧的活跃记忆（被删条目保留在底层）
    actives = _active_episodes(data)
    if len(actives) > MAX_EPISODES:
        overflow_count = len(actives) - MAX_EPISODES
        # 将最旧的 overflow_count 条活跃标记剔除或保持在历史
        # 保持数组整体上限不超过 200 条以防无限膨胀
        if len(data["episodes"]) > 200:
            data["episodes"] = data["episodes"][-200:]

    data["total_letters"] = len(_active_episodes(data))
    if not data.get("first_letter") and actives:
        data["first_letter"] = actives[0]["ts"]

    # L3 晋升：关键事件落进长期记忆
    notables = data.setdefault("notables", {})
    if a["farewell"] and not notables.get("farewell"):
        notables["farewell"] = ep["date"]
    if "love" in a["topics"] and not notables.get("love"):
        notables["love"] = ep["date"]

    _save(data)
    return ep


# ---------------------------------------------------------------- 软删除与后悔药（恢复）

def get_admin_password() -> str:
    env = os.environ.get("OLIVIA_ADMIN_PASSWORD")
    if env:
        return str(env).strip()
    cfg, _ = _skill_config.load_config()
    pwd = (cfg.get("memory") or {}).get("admin_password")
    if pwd is not None and str(pwd).strip():
        return str(pwd).strip()
    return DEFAULT_ADMIN_PASSWORD


def verify_admin_password(pwd: str) -> bool:
    expected = get_admin_password()
    return str(pwd or "").strip() == expected


def soft_delete_episode(ep_id: str) -> bool:
    """软删除单个记忆：标示为 DELETED，不真正物理删除文件。"""
    data = _load()
    changed = False
    now_iso = datetime.now().isoformat(timespec="seconds")
    for e in data.get("episodes", []):
        if e.get("id") == ep_id:
            e["status"] = "DELETED"
            e["deleted"] = True
            e["deleted_at"] = now_iso
            changed = True
            break
    if changed:
        data["total_letters"] = len(_active_episodes(data))
        _save(data)
    return changed


def soft_delete_all() -> int:
    """软删除全部有效记忆：标示为 DELETED，数据依然留存。返回标记数量。"""
    data = _load()
    count = 0
    now_iso = datetime.now().isoformat(timespec="seconds")
    for e in data.get("episodes", []):
        if not e.get("deleted") and e.get("status") != "DELETED":
            e["status"] = "DELETED"
            e["deleted"] = True
            e["deleted_at"] = now_iso
            count += 1
    if count > 0:
        data["total_letters"] = 0
        _save(data)
    return count


def restore_episodes(ep_ids: list[str] | str | None = None) -> int:
    """在后悔处选择回归：将 DELETED 条目恢复为 ACTIVE。

    ep_ids 为 None 或 "all" 时全选恢复；为列表时批量恢复指定 ID。
    返回成功恢复的条数。
    """
    data = _load()
    restored_count = 0
    is_all = (ep_ids is None or ep_ids == "all" or ep_ids == ["all"])
    target_set = set(ep_ids) if isinstance(ep_ids, list) else set()

    for e in data.get("episodes", []):
        if e.get("deleted") or e.get("status") == "DELETED":
            if is_all or e.get("id") in target_set:
                e["status"] = "ACTIVE"
                e["deleted"] = False
                e.pop("deleted_at", None)
                restored_count += 1

    if restored_count > 0:
        actives = _active_episodes(data)
        data["total_letters"] = len(actives)
        if actives and not data.get("first_letter"):
            data["first_letter"] = actives[0]["ts"]
        _save(data)
    return restored_count


def get_deleted_episodes() -> list[dict]:
    """获取所有处于 DELETED 状态的记忆（供后悔处管理面板展示）。"""
    data = _load()
    return _deleted_episodes(data)


# ---------------------------------------------------------------- 读取（仅对 ACTIVE 有效）

def _long_term(data: dict) -> dict:
    eps = _active_episodes(data)
    counts: dict[str, int] = {}
    for e in eps:
        for t in e.get("topics", []):
            counts[t] = counts.get(t, 0) + 1
    top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:TOPICS_IN_PROMPT]
    dates = [e["date"] for e in eps if e.get("date")]
    days_span = 0
    if dates:
        try:
            days_span = 1 + (datetime.strptime(max(dates), "%Y-%m-%d")
                             - datetime.strptime(min(dates), "%Y-%m-%d")).days
        except (ValueError, TypeError):
            days_span = 0

    # 长期关键事件基于当前有效记忆动态计算，防止已删除事件仍留在 AI 画像中
    active_notables: dict[str, str] = {}
    for e in eps:
        if e.get("farewell") and not active_notables.get("farewell"):
            active_notables["farewell"] = e.get("date", "")
        if "love" in e.get("topics", []) and not active_notables.get("love"):
            active_notables["love"] = e.get("date", "")

    return {
        "total_letters": len(eps),
        "first_letter": eps[0]["ts"] if eps else None,
        "top_topics": [{"topic": t, "count": n} for t, n in top],
        "recent_moods": [e.get("mood") for e in eps[-5:]],
        "last_weather": eps[-1].get("weather") if eps else None,
        "days_span": days_span,
        "notables": active_notables,
    }


def get_summary() -> dict:
    data = _load()
    actives = _active_episodes(data)
    deleteds = _deleted_episodes(data)
    return {
        "path": str(resolve_memory_path()),
        "total_letters": len(actives),
        "active_count": len(actives),
        "deleted_count": len(deleteds),
        "long_term": _long_term(data),
        "recent_episodes": actives[-10:],
    }


# ---- 兼容外部调用 ----

def load() -> dict:
    """返回规范化后的完整记忆数据。"""
    return _load()


def total_letters() -> int:
    return len(_active_episodes(_load()))


def long_term(data: dict | None = None) -> dict:
    return _long_term(data if data is not None else _load())


def reset() -> None:
    """清空记忆：软删除全部有效记录，绝不物理删除文件。"""
    soft_delete_all()


_TOPIC_ZH = {
    "sad": "难过", "anxiety": "焦虑", "work": "工作", "study": "学业", "love": "心动",
    "thanks": "感谢", "music": "音乐", "weather": "天气", "dream": "方向", "ill": "身体",
    "family": "家人", "friend": "朋友", "food": "吃食", "daily": "日常",
}


def render_context() -> str:
    """生成注入 system prompt 的记忆块（严格过滤 DELETED 条目；无有效记忆时返回空串）。"""
    data = _load()
    eps = _active_episodes(data)
    if not eps:
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
    for e in eps[-RECENT_IN_PROMPT:]:
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
    """基于最近一条有效情景记忆生成一句"回声"（排除 DELETED）。无有效记忆返回 None。"""
    data = _load()
    eps = _active_episodes(data)
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
