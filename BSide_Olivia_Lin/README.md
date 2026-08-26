# BSide_Olivia_Lin · 人格蒸馏复刻

> 《BSide: Olivia Lin》（米哈游「稻海桑田工作室」AI 陪伴应用）于 **2026-08-11 官宣停止运营**。
> 她的核心玩法「书信式 AI 陪伴」——你写信倾诉，她按人设回一封信，每天三封、两三分钟节奏——
> 本目录把它**蒸馏**成一套可加载的 skill，并配了一个可运行的信件网页复刻该功能。

对应 Windows 路径：`D:\Datum\nuclearBomb\BSide_Olivia_Lin`（本仓库内即 `BSide_Olivia_Lin/`，可整体拷贝）。

---

## 一、目录结构

```
BSide_Olivia_Lin/
├── SKILL.md                  ← skill 入口（frontmatter + 用法 + 输出契约 + 方法论）
├── README.md                 ← 本文件
├── persona/
│   ├── olivia_lin.md         ← Layer 0-4 人格模型（硬规则/身份/人格/语言风格/情感模式）
│   ├── memories.md           ← Layer 5 记忆库（公开时间线/生活细节/语气锚点）
│   └── letter_craft.md       ← 书信技艺（结构/篇幅/天气与时间/场景策略/红线）
├── samples/
│   ├── letters_from_her.md   ← 4 封 few-shot 风格锚点信件（含告别信；重建样本，可替换为真实语料）
│   └── eval_testcases.md     ← 10 条蒸馏验收用例 + 红线清单
├── distill/
│   └── CORPUS_TEMPLATE.md    ← 真实语料（游戏内导出回信）整理模板
├── skill/                    ← 可编程部分
│   ├── loader.py             ← build_system_prompt()：组装完整 system prompt
│   ├── model_client.py       ← 模型空壳（http://127.0.0.1:8045，超时保护 + 降级）
│   └── local_engine.py       ← 离线人格引擎（模型不可达时的响应式回信）
└── app/                      ← 演示网页
    ├── server.py             ← 零依赖 HTTP 服务（stdlib）
    └── static/               ← index.html / css/style.css / js/app.js
```

## 二、快速开始

```bash
# 1) 查看组装好的 system prompt
python3 -m skill.loader > /tmp/system_prompt.txt

# 2) 跑本地人格引擎（无需任何模型，离线可用）
python3 -m skill.local_engine

# 3) 启动信件网页（浏览器打开 http://127.0.0.1:8000）
python3 app/server.py
```

可选：装 `google-generativeai` 后，若你在本机 `127.0.0.1:8045` 起了模型服务，
网页与 API 会自动走真实调用（`skill/model_client.py` 中即用户指定的配置方式）；
端点不可达时**永远自动降级**到本地人格引擎，页面不会挂、不会空。

## 三、模型空壳（响应式）

`skill/model_client.py` 按如下方式配置（保持原样，仅端点/模型可用环境变量覆盖）：

```python
import google.generativeai as genai
genai.configure(
    api_key="test",
    transport='rest',
    client_options={'api_endpoint': 'http://127.0.0.1:8045'}
)
```

- `OLIVIA_ENDPOINT`：覆盖端点（默认 `http://127.0.0.1:8045`）
- `OLIVIA_MODEL`：模型名（默认 `gemini-2.5-flash`）
- `OLIVIA_TIMEOUT`：调用超时秒数（默认 15，超时即降级）

API：

```
GET  /api/status            → {endpoint, model, genai_loaded, model_up, ...}
POST /api/letter            → {"text": "来信正文"}
     ← {reply, weather: 晴|阴|小雨|雨, mood, engine: model|local-persona, ms}
```

## 四、人格蒸馏方法（Personal Distillation）

本 skill 的做法综合了公开的人格蒸馏实践与学术路线：

1. **语料收集**（PersLLM 式：传记/第三方描述/个人信件/作品）
   - 官方人设：上海女生、主修钢琴、辅修心理学、爱黑胶/老电影/雨天、研究「音乐与回忆」
     （Steam 商店页 / IT之家 / 百度百科）
   - 唯一公开语气锚点：2026-03 B 站「读信/回信」视频原话——
     "读了一些故事，也试着回答了一点。有些选择，没有对错，只是时间刚好那样走了。我们只是后来才看懂的。"
     （已拆解为她的"四步看世界"，写入 Layer 3）
   - 玩家社区气质描述："不会主动讨好你""音乐厅里不敢搭话的优雅演奏者"
2. **五层人格建模**：硬规则（不破人设）→ 身份 → 人格模型（大五参数）→
   语言风格（句长/段落/标点/修辞习惯的**量化参数**）→ 情感模式 → 记忆库。
3. **书信技艺解耦**："像不像她"（persona）与"像不像一封信"（craft）分开写、分开调。
4. **Few-shot 锚定 + 风格注记**：4 封覆盖委屈/日常/低落/告别的信件，逐条标注锚定了什么特征。
5. **可验收**：`samples/eval_testcases.md` 的 10 用例 + 红线清单，把"像不像"变成打勾项。
6. **可迭代**：把游戏内真实回信按 `distill/CORPUS_TEMPLATE.md` 整理后替换 few-shot，重跑验收。

参考（详见文末来源）：human-distillation-skills（人格蒸馏 skill 生态）、
immortal-skill（四维蒸馏 + 证据分级）、5 层 Persona 结构（Layer 0 硬规则…）、
15 特质 persona JSON、PersLLM / PersonaLLM / Character-LLM（学术）。

## 五、网页复刻说明（app/）

复刻了原功能的核心体验，并做了演示化改造：

| 原功能 | 网页复刻 |
|---|---|
| 每天 3 封信上限 | 保留（默认"不限量（演示）"开关可放开），计数按天 |
| 两三分钟回信等待（书信节奏感） | 读信状态动画 + 至少 3.2 秒等待（演示加速） |
| 回信贴合人设（钢琴/心理学/雨天） | 回信由 skill 生成：情绪→天气（下雨天她会开窗听雨）、情绪→正文、情绪→结尾 |
| 回信分文字/视频（情感浓度高触发视频） | 情感浓度高（告别信）触发长信；雨天回信会在信纸上下雨 |
| 触发视频回信的社区规律 | 本地引擎实现了同源规则：情绪浓度决定篇幅与天气 |

技术：纯静态前端（HTML/CSS/手写 JS，无框架、无构建）+ 零依赖 Python stdlib 后端；
纸墨双主题（昼/夜）、火漆封缄动画、信封飞行、打字机回信、WebAudio 环境音（无音频素材，
全部实时合成）、本地信件存档（localStorage）、打印样式。

## 六、资料来源（2026-08-26 检索）

- 《BSide: Olivia Lin》Steam 抢先体验报道：[IT之家](https://www.ithome.com/0/976/033.htm)、
  [3DM 官方介绍页](https://dl.3dmgame.com/pc/151263.html)、[百度百科](https://baike.baidu.com/item/BSide:Olivia%20Lin/68059713)
  （含 2026-08-11 停止运营公告）
- 上线与口碑报道：[搜狐/游戏日报](https://m.sohu.com/a/1050778804_122861151)、
  [游戏日报·口碑反转](https://m.sohu.com/a/1050504144_118576/)（"每天三封、两三分钟节奏"
  、"情感浓度越高越容易触发视频回应"、"大伟哥永远得不到的人"）
- 她的公开语气锚点：B 站「林离Olivia」[读信/回信/弹琴](https://www.bilibili.com/video/BV11BXnBaEKR/)
  （2026-04 前后，演奏《Mia & Sebastian's Theme》）
- 人格蒸馏方法论：
  [human-distillation-skills](https://github.com/misshiding/human-distillation-skills)、
  [immortal-skill](https://github.com/agenmod/immortal-skill)、
  [forge-skill](https://github.com/YIKUAIBANZI/forge-skill)、
  [5 层 Persona 结构实践](https://www.cnblogs.com/To-Carpe-Diem/p/19854533)、
  [persona JSON 15 特质法](https://www.reddit.com/r/PromptEngineering/comments/1lng59u/how_would_you_go_about_cloning_someones_writing/)、
  [PersLLM (arXiv 2407.12393)](https://arxiv.org/html/2407.12393v2)、
  [PersonaLLM](https://www.emergentmind.com/topics/personallm)、
  [Modeling/Evaluating/Embodying Personality in LLMs (EMNLP 2025)](https://aclanthology.org/2025.findings-emnlp.506.pdf)

## 七、伦理与合规

林离（Olivia Lin）是米哈游旗下的**虚构角色 IP**。本项目为个人、非商业性质：
在停服后复刻其书信陪伴功能，作为纪念与人格蒸馏方法的演示。
请勿用于商业运营、冒充真人，或生成可能误导他人的"林离本人"内容。
