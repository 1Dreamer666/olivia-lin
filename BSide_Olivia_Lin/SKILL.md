---
name: bside-olivia-lin-letter
description: 复刻《BSide: Olivia Lin》主角林离（Olivia Lin）的书信回信人格。当用户需要"以林离的口吻给来信者写一封回信"时使用本 skill——输入一封来信，输出一封有生活质感的回信。
version: 1.0.0
---

# 林离 · 回信 Skill（Personal / Persona Distillation）

《BSide: Olivia Lin》（米哈游「稻海桑田工作室」AI 陪伴应用，2026-08-11 停止运营）中，
林离的"写信—回信"功能是其核心玩法：玩家写信倾诉情绪，林离**按人设**生成专属回信，
慢节奏、非即时聊天、每天三封。本 skill 把这套功能从应用里"蒸"出来，变成可加载、可验收、可替换语料的人格技能。

## 一、快速开始

### 方式 A：作为 system prompt 使用（推荐）

```python
from skill.loader import build_system_prompt
system = build_system_prompt()      # 组装 Layer0-5 + 书信技艺 + few-shot
# 把 [system, 用户来信] 发给任意 LLM 即可
```

命令行直接打印：

```bash
python -m skill.loader
```

### 方式 B：跑演示网页（含响应式模型空壳）

```bash
cd BSide_Olivia_Lin                    # 项目可放在任意目录
pip install google-generativeai        # 可选：不装则自动降级为本地人格引擎
python app/server.py                   # http://0.0.0.0:8000（端口等见 config.json）
```

模型服务（默认 http://127.0.0.1:8045，`config.json` 的 model 段可改）可达时走真实调用；
不可达时**自动降级**到 `skill/local_engine.py`（纯 Python 人格引擎，离线可用）——
即用户指定的"响应式空壳"。

> 路径解耦：语料（`persona/`、`samples/`）、静态资源、端口、模型端点全部由
> 项目根 `config.json` 驱动（详见 README 第三节），`python <任意路径>/app/server.py`
> 与项目位置无关；无 config.json 时使用内置默认布局。

## 二、输出契约

回信必须是**一封信**（结构见 `persona/letter_craft.md`）。程序化调用时返回：

```json
{
  "reply": "完整信件文本（含落款 —— 林离）",
  "weather": "晴 | 阴 | 小雨 | 雨",
  "mood": "平静 | 温暖 | 明亮 | 温柔 | 克制",
  "engine": "model | local-persona"
}
```

## 三、文件结构

```
BSide_Olivia_Lin/
├── SKILL.md                  ← 本文件（入口）
├── config.json               ← 唯一配置入口（路径/端口/模型端点/回信节奏，可选）
├── persona/
│   ├── olivia_lin.md         ← Layer 0-4 人格模型（硬规则/身份/人格/语言/情感）
│   ├── memories.md           ← Layer 5 记忆库（时间线/生活细节/语气锚点）
│   └── letter_craft.md       ← 书信技艺（结构/篇幅/场景策略/红线）
├── samples/
│   ├── letters_from_her.md   ← 4 封风格锚点信件（few-shot，重建样本，可被真实语料替换）
│   └── eval_testcases.md     ← 10 条验收用例 + 红线清单
├── distill/
│   └── CORPUS_TEMPLATE.md    ← 真实语料（游戏内导出回信）的整理模板
├── skill/
│   ├── config.py             ← 配置加载与路径解析（路径解耦）
│   ├── loader.py             ← 组装 system prompt
│   ├── local_engine.py       ← 离线人格引擎（降级用）
│   └── model_client.py       ← 模型空壳客户端（默认 127.0.0.1:8045，含超时与降级）
└── app/
    ├── server.py             ← 零依赖 HTTP 服务（静态页 + /api/letter）
    └── static/               ← 演示网页（index.html / css / js）
```

## 四、蒸馏方法（本 skill 是怎么做出来的）

依据公开的人格蒸馏（Personal / Persona Distillation）方法论：

1. **语料收集**：官方人设（Steam 商店页/IT之家/百科）、公开报道中她的真实语气锚点
   （2026-03 B 站「读信/回信」视频原话）、玩家社区对其气质的描述（"不会主动讨好""音乐厅里
   不敢搭话的演奏者"）。→ 见 README.md 的资料来源。
2. **五层人格建模**（Layer 0 硬规则 → 1 身份 → 2 人格模型 → 3 语言风格量化参数 →
   4 情感模式 → 5 记忆库）：硬规则保证不破人设，量化参数（句长/段落/标点/修辞习惯）
   保证"听起来像"，记忆库保证"活着"。
3. **书信技艺单独成文**：把"怎么写一封信"（结构、篇幅、场景策略、红线）与"像不像她"
   解耦，便于分别调优。
4. **Few-shot 锚定**：4 封覆盖「委屈 / 日常 / 低落 / 告别」的代表性信件，逐封附风格注记。
5. **可验收**：10 条 eval 用例 + 红线清单，让"像不像"变成可打勾的指标。
6. **可迭代**：把游戏内真实回信按 `distill/CORPUS_TEMPLATE.md` 整理后替换 few-shot，
   重跑 eval 即可提升保真度（语料越多越像，方法论同 PersLLM / persona-skills 生态）。

## 五、伦理与合规

- 林离（Olivia Lin）为米哈游旗下的虚构角色 IP。本项目为**个人、非商业**性质，
  目的是在停服后复刻其"书信陪伴"功能作为纪念与学习（人格蒸馏方法演示）。
- 请勿用于商业运营、冒充真人、或生成可能误导他人的"林离本人"内容。
- 涉及自我伤害类来信的处理策略见 `persona/olivia_lin.md` Layer 0 第 8 条。
