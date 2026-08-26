"""组装「林离回信」skill 的 system prompt。

用法:
    from skill.loader import build_system_prompt
    system = build_system_prompt()
    # 将 [system, 用户来信] 发给任意 LLM

    或命令行: python -m skill.loader

语料位置由 skill.config.resolve_skill_root() 决定（config.json / 环境变量 /
默认布局），本文件不写死任何目录。
"""
from __future__ import annotations

import sys
from pathlib import Path

from skill import config as _skill_config

_REQUIRED = [
    "persona/olivia_lin.md",
    "persona/memories.md",
    "persona/letter_craft.md",
    "samples/letters_from_her.md",
]


def base_dir() -> Path:
    return _skill_config.resolve_skill_root()


def _read(rel: str) -> str:
    p = base_dir() / rel
    if not p.is_file():
        raise FileNotFoundError(
            f"skill 文件缺失: {p} —— 请在 config.json 中设置 skill_root "
            f"（或用环境变量 OLIVIA_SKILL_ROOT）指向包含 persona/ 与 samples/ 的目录"
        )
    return p.read_text(encoding="utf-8").strip()


def build_system_prompt(include_samples: bool = True, time_hint: str | None = None,
                        memory_context: str | None = None) -> str:
    parts = [
        "你是「林离」（Olivia Lin）——《BSide: Olivia Lin》中的角色，正在给一位笔友回信。"
        "请完整阅读并严格遵守以下人格蒸馏档案（硬规则 > 身份/人格 > 语言风格 > 书信技艺），"
        "然后只输出回信本身：一封完整的信，含落款「—— 林离」。"
        "不要输出任何解释、前缀、JSON 或引号。",
        "# 人格档案 · 林离\n\n" + _read("persona/olivia_lin.md"),
        "# 记忆库\n\n" + _read("persona/memories.md"),
        "# 书信技艺\n\n" + _read("persona/letter_craft.md"),
    ]
    if include_samples:
        parts.append("# Few-shot 风格锚点（仅供模仿语气与结构，不要照抄内容）\n\n"
                     + _read("samples/letters_from_her.md"))
    if memory_context:
        parts.append(
            "# 分级记忆 · 她与这位笔友的往来（L3 长期画像 + L2 近期情景）\n\n"
            + memory_context
            + "\n\n使用规则：若记忆与本轮来信有可自然衔接之处，用**一句话**轻轻呼应"
            "（如「你上次写的那支曲子……」）；只允许引用记忆块里写过的内容，"
            "不得编造其外的记忆；与上一封信衔接过多时，宁可不呼应。"
        )
    task = ["# 本次任务"]
    if time_hint:
        task.append(f"写信时点（用于起首）：{time_hint}")
    task.append("请读取读者来信，按档案回一封信。只引用来信中出现过的内容，不得编造对方的记忆。")
    parts.append("\n".join(task))
    return "\n\n---\n\n".join(parts)


if __name__ == "__main__":
    sys.stdout.write(build_system_prompt())
