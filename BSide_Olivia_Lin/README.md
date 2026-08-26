# BSide_Olivia_Lin · 人格蒸馏复刻

> 《BSide: Olivia Lin》（米哈游「稻海桑田工作室」AI 陪伴应用）于 **2026-08-11 官宣停止运营**。
> 她的核心玩法「书信式 AI 陪伴」——你写信倾诉，她按人设回一封信，每天三封、两三分钟节奏——
> 本目录把它**蒸馏**成一套可加载的 skill，并配了一个可运行的信件网页复刻该功能。

**本目录可放在任意位置**（Windows / Linux / macOS 均可，例如 `D:\Datum\nuclearBomb\BSide_Olivia_Lin`，
但并非必须）：项目内所有路径均为相对路径或由 `config.json` 驱动，不写死任何目录。

---

## 一、目录结构

```
BSide_Olivia_Lin/
├── SKILL.md                  ← skill 入口（frontmatter + 用法 + 输出契约 + 方法论）
├── README.md                 ← 本文件
├── config.json               ← 唯一配置入口（路径/端口/模型端点/回信节奏，可选）
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
│   ├── config.py             ← 配置加载与路径解析（路径解耦的唯一入口）
│   ├── loader.py             ← build_system_prompt()：组装完整 system prompt
│   ├── model_client.py       ← 模型空壳（默认 http://127.0.0.1:8045，超时保护 + 降级）
│   └── local_engine.py       ← 离线人格引擎（模型不可达时的响应式回信）
└── app/                      ← 演示网页
    ├── server.py             ← 零依赖 HTTP 服务（stdlib）
    └── static/               ← index.html / css/style.css / js/app.js
```

## 二、快速开始

```bash
cd <本目录>          # 例如 D:\Datum\nuclearBomb\BSide_Olivia_Lin
python app/server.py # 浏览器打开 http://127.0.0.1:8000
```

也可以从任意目录直接运行（路径与当前目录无关）：

```bash
python C:\x\y\BSide_Olivia_Lin\app\server.py
```

其他用法：

```bash
python -m skill.loader        # 打印组装好的 system prompt
python -m skill.local_engine  # 跑本地人格引擎（无需任何模型，离线可用）
```

可选：装 `google-generativeai` 后，若你在本机 `127.0.0.1:8045` 起了模型服务，
网页与 API 会自动走真实调用（`skill/model_client.py` 中即用户指定的配置方式）；
端点不可达时**永远自动降级**到本地人格引擎，页面不会挂、不会空。

## 三、路径与配置（config.json）

项目根目录的 `config.json` 是唯一配置入口（不存在时全部用内置默认值，行为不变）：

| 键 | 默认 | 说明 |
|---|---|---|
| `host` / `port` | `0.0.0.0` / `8000` | 监听地址与端口 |
| `skill_root` | `auto` | 包含 `skill/`、`persona/`、`samples/` 的目录（"项目根"）。`auto` = skill 包上级目录；可写相对/绝对路径 |
| `static_dir` | `auto` | 网页静态资源目录（`index.html`/`css`/`js`）。`auto` = `app/static` |
| `model.api_key` | `test` | 模型调用 api key |
| `model.endpoint` | `http://127.0.0.1:8045` | 模型端点 |
| `model.model` | `gemini-2.5-flash` | 模型名 |
| `model.timeout` | `15` | 模型调用超时（秒），超时即降级本地引擎 |
| `reply.min_reading_ms` | `3200` | 前端"读信"最短等待（保留书信节奏感） |
| `reply.max_letters_per_day` | `3` | 每日信件上限（前端"不限量（演示）"可放开） |

规则：
- 相对路径一律相对 **config.json 所在目录**解析（与运行时 cwd 无关）；
- 配置文件查找顺序：`OLIVIA_CONFIG` 环境变量 → 项目自带 `config.json` → 工作目录 `config.json`；
- 环境变量可覆盖单项：`PORT`、`HOST`、`OLIVIA_SKILL_ROOT`、`OLIVIA_ENDPOINT`、`OLIVIA_MODEL`、`OLIVIA_API_KEY`、`OLIVIA_TIMEOUT`；
- **拆分部署**示例——语料与网页分离（`app/` 放 A 处，`skill/`+`persona/`+`samples/` 放 B 处）：
  在 A 处建 `config.json` 写 `"skill_root": "B 的绝对或相对路径"` 即可。

## 四、模型空壳（响应式）

`skill/model_client.py` 按如下方式配置（数值来自 config.json 的 model 段，环境变量可覆盖）：

```python
import google.generativeai as genai
genai.configure(
    api_key="test",
    transport='rest',
    client_options={'api_endpoint': 'http://127.0.0.1:8045'}
)
```

- 默认值即上表 model 段；环境变量 `OLIVIA_ENDPOINT` / `OLIVIA_MODEL` / `OLIVIA_API_KEY` / `OLIVIA_TIMEOUT` 可逐项覆盖

API：

```
GET  /api/status            → {endpoint, model, genai_loaded, model_up, ...}
POST /api/letter            → {"text": "来信正文"}
     ← {reply, weather: 晴|阴|小雨|雨, mood, engine: model|local-persona, ms}
```

## 五、人格蒸馏方法（Personal Distillation）

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

## 六、网页复刻说明（app/）

复刻了原功能的核心体验，并做了演示化改造：

| 原功能 | 网页复刻 |
|---|---|
| 每天 3 封信上限 | 保留（默认"不限量（演示）"开关可放开），计数按天 |
| 两三分钟回信等待（书信节奏感） | 读信状态动画 + 至少 `reply.min_reading_ms`（默认 3.2 秒）等待（演示加速） |
| 回信贴合人设（钢琴/心理学/雨天） | 回信由 skill 生成：情绪→天气（下雨天她会开窗听雨）、情绪→正文、情绪→结尾 |
| 回信分文字/视频（情感浓度高触发视频） | 情感浓度高（告别信）触发长信；雨天回信会在信纸上下雨 |
| 触发视频回信的社区规律 | 本地引擎实现了同源规则：情绪浓度决定篇幅与天气 |

技术：纯静态前端（HTML/CSS/手写 JS，无框架、无构建）+ 零依赖 Python stdlib 后端；
纸墨双主题（昼/夜）、火漆封缄动画、信封飞行、打字机回信、WebAudio 环境音（无音频素材，
全部实时合成）、本地信件存档（localStorage）、打印样式。

### 6.1 用模型重写（force=model）

`POST /api/letter` 支持 `force` 字段：

```json
{"text": "今天的夕阳很好看", "force": "model"}   // 强制走模型
{"text": "…",            "force": "local"}  // 强制走本地引擎
{"text": "…"}                                  // 默认 auto：可达走模型，否则降级
```

- `force=model` 但模型端点不可达时，**直接返回 503**（不降级）——前端会弹 toast。
- 模型的 system prompt 已自动注入「分级记忆」上下文（见 §六.2），让模型也能"记得"之前的信。
- 写信按钮的右侧"用模型重写"按钮在 `/api/status` 显示模型可达时出现；点击会重新发一封
  `force=model` 的请求，并用新回复**覆盖**最近一封存档（draft 与最后一条 text 相同时；
  否则按新信追加）。这就是用户要的那条："把 API 返回的内容替换到本地引擎已有的信"。

### 6.2 分级记忆（Hierarchical Memory）

参考生产级 agent 记忆的三层共识：
[Letta/MemGPT 的 core-recall-archival](https://github.com/letta-ai/letta)、
[MemoryOS 的短期/中期/长期](https://github.com/MemTensor/MemOS)、
[H-MEM 的分层索引与逐级摘要](https://arxiv.org/abs/2509.09630)、
[Anatomy of Agentic Memory 的 4 类记忆结构](https://arxiv.org/abs/2508.06468)、
[Agent_Memory_Techniques](https://github.com/GAIR-NLP/Agent-Memory-Techniques)（30 种技术合集）。
落地为文件式（`data/memory.json`，零依赖、可人工编辑）：

| 层 | 内容 | 容量 | 写入 |
|---|---|---|---|
| L1 工作记忆 | 当前来信 + 本轮回复 | 仅当轮 | 上下文（不落盘） |
| L2 情景记忆 | episode 日志：ts / topics / weather / mood / engine / user_digest / reply_digest | 最近 30 条（旧的"遗忘"） | 每次寄信后自动 |
| L3 长期记忆 | 长期画像：首信日期 / 累计 / 主题频率 / 近期情绪 / 关键事件 | 单条 JSON 摘要 | L2 写入时按频率+时近性"晋升" |

**渲染与回声：**
- 模型路径：`memory_bank.render_context()` 自动拼到 `loader.build_system_prompt(memory_context=…)`；
  注入内容只引用已记下的事实，禁止编造。
- 本地引擎：`memory_bank.memory_echo(exclude_digest=…)` 基于最近一封情景记忆
  生成一句"回声"（按主题匹配），插进回信中段——所以"上次你说工作……"这种回声
  在她手写时也会自然出现（不依赖模型）。

**调用：**

```bash
curl http://127.0.0.1:8000/api/memory
# → {ok, path, total_letters, first_letter, long_term, episodes:[最近10条]}

curl -X POST -H "Content-Type: application/json" -d '{"reset":true}' \
     http://127.0.0.1:8000/api/memory
# → 清空记忆
```

**编辑记忆（这也是 FAQ#1 的答案）：**
`data/memory.json` 是 UTF-8 的 JSON 文件，可直接打开编辑——改 topic 计数、改 mood、
追加/删 episode。改完即生效（进程内 / 下次进程读盘时取到新内容）。
frozen 模式（exe）下，记忆文件位于 **exe 同级 `data/memory.json`**（可备份、可在多台机器之间拷）。
这种"能改文件"的设计让"把 API 返回的内容替换到本地引擎的信里"成为
**改 `data/memory.json` 里的 `reply_digest` 字段** 这样的直接动作（前端"用模型重写"
则是把"最近一封存档的 reply 字段直接覆写"的封装）。

## 七、Windows EXE 与 Release

通过 GitHub Actions（`windows-latest` 跑 `pyinstaller build/olivia.spec`）生成 onedir
发布包；PyInstaller **不能**在 Linux 上交叉编译 Windows 可执行文件，因此本沙箱里直接
build 不了，CI 才是真正产出 exe 的地方：

```text
.github/workflows/build-windows-exe.yml   # workflow_dispatch 触发
build/olivia.spec                         # PyInstaller spec（onedir）
build/build_exe.bat                       # Windows 本地一键打包（双击即跑）
dist/OliviaLetterBox/                     # CI 产物（spec 运行后）
OliviaLetterBox-win-x64.zip               # 压缩后的 Release 资产
```

本地打包（在你自己的 Windows 机器上）：

```bat
cd BSide_Olivia_Lin
build\build_exe.bat
REM 产物：dist\OliviaLetterBox\OliviaLetterBox.exe
```

exe 运行特性：
- 资源（`app/static`、`persona`、`samples`、默认 `config.json`）打进 `sys._MEIPASS`，无需带额外文件；
- 用户可编辑的 `config.json` / `data/memory.json` 放在 **exe 同级目录**（覆盖内置默认）；
- 启动后默认自动打开浏览器（`open_browser: false` 或 `OLIVIA_BROWSER=0` 可关闭）。

## 八、常见疑问（FAQ）

**Q1. 我把 `skill/model_client.py` 里的 key / endpoint 改错了，但服务仍然能向"API"发请求，
本地引擎也一直有回应——为什么？**
- key 写错只影响"请求的鉴权头是否正确"，不会影响"端点是否可达"。
  `model_client.model_available()` 用的是**TCP 探活**（`127.0.0.1:8045` 是否 listen），
  不是真正发起鉴权调用——所以即便 key 是 `test` 或者乱写，只要端口开着，
  probe 也会返回 `True`，进而去尝试 `ask_model()`。
- "本地引擎"一直有回应 = **响应式空壳的设计**：模型端点不可达 / 调用失败
  时 `handle_letter()` 自动降级到 `local_engine.respond()`，保证页面不会"没回音"。
  这是有意的（你之前要求的"做一个响应式空壳即可"），不是 bug。
- 你以为生效了但其实没生效？最常见原因是 **旧的 server 进程仍在内存里**——你编辑了
  `model_client.py`，但没重启 `python app/server.py`，Python 进程加载的是旧版模块。
  Python `__pycache__` 不会成为拦路虎：源文件 mtime/size 一变，.pyc 自动失效重编。
  浏览器侧有 `Cache-Control: no-store`，也不存在缓存。
- 真正"用文件接管"的方式：把 `data/memory.json` 里的 `reply_digest` / `topics` 改掉，
  改的就是她"记得"的内容；也可以用前端"用模型重写"按钮一键把 API 的回复覆盖到最近一封存档上。

**Q2. 信件之间没有上下文关联？** —— 现在 §六.2 加入了三级记忆：L2 滚动保存最近 30 封
episodes，L3 按频率 / 时近性聚合出"长期画像"，并自动注入 system prompt（模型路径）
或作为"回声"插入本地引擎回信中段。你也可以直接编辑 `data/memory.json` 强行注入"她该记得的事"。

**Q3. 怎么打成 Windows exe / 怎么发 Release？** —— §七：在 GitHub 上手动跑一次
Actions → build-windows-exe，下载 artifact，把 `OliviaLetterBox-win-x64.zip` 作为 Release 资产上传。
或者在你自己的 Windows 机器上双击 `build\build_exe.bat` 本地重建。

## 九、资料来源（2026-08-26 检索）

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
- 分级记忆：
  [Letta (MemGPT) 论文](https://arxiv.org/abs/2310.08560)、
  [MemoryOS 论文](https://github.com/MemTensor/MemOS)、
  [H-MEM (arXiv 2509.09630)](https://arxiv.org/abs/2509.09630)、
  [Anatomy of Agentic Memory (arXiv 2508.06468)](https://arxiv.org/abs/2508.06468)、
  [Agent-Memory-Techniques 30 法合集](https://github.com/GAIR-NLP/Agent-Memory-Techniques)、
  [Mem0 长期记忆](https://github.com/mem0ai/mem0)

## 十、伦理与合规

林离（Olivia Lin）是米哈游旗下的**虚构角色 IP**。本项目为个人、非商业性质：
在停服后复刻其书信陪伴功能，作为纪念与人格蒸馏方法的演示。
请勿用于商业运营、冒充真人，或生成可能误导他人的"林离本人"内容。
