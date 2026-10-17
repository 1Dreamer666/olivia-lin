# BSide · 林离的信箱 开发者与维护指南 (DEVELOPER.md)

> 本文档面向**本项目开发者与创作者自身**，用于厘清日常分支开发、B站 Toy 平台网页部署、Windows 可执行文件构建打包、GitHub Release 资产同步（zip/exe）以及整体架构维护的全流程。

---

## 目录
1. [分支协作与流转模型](#一分支协作与流转模型)
2. [B站 Toy 平台（bilibili-toys）部署与同步](#二b站-toy-平台bilibili-toys部署与同步)
3. [Windows EXE 打包与 Release 资产同步](#三windows-exe-打包与-release-资产同步)
4. [核心架构与代码模块规范](#四核心架构与代码模块规范)
5. [常用命令速查](#五常用开发运维命令速查)

---

## 一、分支协作与流转模型

为兼顾「普通用户获得干净稳定的 Release」与「开发者自身全量特性探索」，采用双层分支流转体系：

```text
  [feature/toy-web-ts] (开发次分支：兼顾全量开发内容)
       ├── TypeScript 引擎 (src/)
       ├── 前端交互演进 & B站 Toy 部署维护
       ├── 多模型协议扩展 & 记忆库强化
       └── 内部实验特性
           │
           │  (开发自测通过后，挑选合入)
           ▼
     [main] (主分支 / 发布分支)
       ├── 纯净面向终端用户（用户专用 README.md）
       ├── 打 tag (v*) 触发 CI 自动构建
       └── 挂载 GitHub Releases (exe / zip)
```

### 1. 主力开发分支：`feature/toy-web-ts`
- **定位**：你日常写代码、做实验、部署 Toy 网页的专属主战场；
- **内容**：兼顾所有分支的开发内容，包含全量技术栈（TypeScript 引擎 `src/`、Python 核心 `skill/`、Toy 平台静态网页 `app/static/`、开发指南等）；
- **日常操作**：始终在该分支上进行新功能开发、修改测试。

### 2. 用户发布主分支：`main`
- **定位**：面向下载 Release 软件或浏览项目主页的普通用户与玩家；
- **原则**：只包含稳定功能与用户说明（不暴露内部开发/部署运维细节）；
- **同步工作流**：
  ```bash
  # 1. 在 feature/toy-web-ts 完成开发与自测
  git checkout feature/toy-web-ts
  git add . && git commit -m "feat: 新功能实现"

  # 2. 切换到 main 分支并挑选/合并用户部分
  git checkout main
  git merge feature/toy-web-ts --no-ff -m "chore: 合并最新稳定功能至主分支"

  # 3. 推送主分支并打 Tag 发布 Release（需通过代理 7897）
  git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main
  git tag -a "v0.3.0" -m "Release v0.3.0"
  git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin v0.3.0
  ```

---

## 二、B站 Toy 平台（bilibili-toys）部署与同步

前端网页（`app/static/`）是一个零构建依赖的现代单页应用，支持通过 B站官方 `toy` 命令行工具直接发布到 B站 Toy 平台，并挂载到视频播放页。

- **线上已发布 Toy 链接**：**[https://www.bilibili.com/toy/0sVLW1tfAFM7H4YA/index.html](https://www.bilibili.com/toy/0sVLW1tfAFM7H4YA/index.html)**
- **部署源目录**：`app/static/`（入口必须为 `index.html`）

### 1. 平台运行规范与内容铁律（防白屏必读）
B站 Toy 页面运行在 `/toy/<slug>/` 子路径下：
- **资源相对路径铁律**：`index.html` 中的 CSS、JS、图片引用**必须全部使用相对路径**（`./css/style.css`、`./js/app.js`、`./poster.jpg`），严禁使用绝对根路径（如 `/css/...`），否则在 Toy 平台会引发资源 404 导致页面白屏；
- **纯前端与后端双体验设计**：
  - **默认沉浸模式**：完全脱离 Python 后端运行，依靠内置离线规则、WebAudio 音频合成、首信逻辑呈现完整书信仪式；
  - **自定义模型通道**：用户点击「⚙ 系统设置」，可直接填入任意 OpenAI 兼容（DeepSeek / GPT）、Claude 或 Gemini 的公网 API Endpoint 与 Key，由浏览器直接向大模型发起通信。

### 2. 官方 `toy` CLI 常用运维命令

本地已安装 `toy` 工具（`C:\Users\chr\AppData\Local\Programs\toy\toy.exe`）：

```bash
# 1. 登录 B 站创作者账号（自动拉起浏览器 OAuth 授权）
toy login

# 2. 查看我已发布的 Toy 列表及 ID
toy mylist --json

# 3. 更新已有的线上 Toy（带包体更新，两段式）
# a. 先不加 --yes 预览
toy update <toy_id> app/static --json
# b. 检查返回的 preview_url 确认无误后，加 --yes 正式提交审核
toy update <toy_id> app/static --yes

# 4. 把 Toy 挂载到自己的 B 站视频播放页（调用即生效，无需审核）
toy video bind <BV号> --toy <toy_id>

# 5. 查看访问与互动数据统计（近 7 天 PV/UV、点赞互动量）
toy stats <toy_id>
```

---

## 三、Windows EXE 打包与 Release 资产同步

为了满足不同用户的下载习惯，本项目同时维护并发布两种 Windows 可执行文件形态：

### 1. 构建产物说明

| 产物文件名 | 构建模式 | 特点与适用场景 |
| :--- | :--- | :--- |
| **`OliviaLetterBox.exe`** | `onefile` (单文件版) | 单个 exe 约 45.8 MB，用户双击即跑，无需解压缩，随处拷贝便携。 |
| **`OliviaLetterBox-win-x64.zip`** | `onedir` (绿色便携包) | 解压后文件夹约 45.8 MB，启动为毫秒级（不向 TEMP 释放临时文件），配置 `config.json` 与记忆 `data/memory.json` 在 exe 同级持久化保存。 |
| **`BSide_Olivia_Lin.zip`** | 源码打包 | 纯净源代码与 Skill 语料归档，约 76 KB。 |

### 2. 本地一键打包步骤（在 Windows 机器上）

在 `BSide_Olivia_Lin` 目录下直接运行打包脚本：

```bat
REM 进入项目目录
cd BSide_Olivia_Lin

REM 1. 运行本地一键构建脚本（生成 onedir 并自动打包为 zip）
build\build_exe.bat

REM 2. 构建单文件版 exe
pyinstaller build/olivia_onefile.spec --noconfirm --clean --distpath "..\dist-standalone"
```

### 3. GitHub Actions CI 自动发布（推荐）

仓库根目录已配置 `.github/workflows/release.yml`：
- 当你在 `main` 分支推送形如 `v*` 的 Git Tag 时（例如 `v0.2.2`）：
  1. GitHub Actions（`windows-latest` Runner）自动检出代码；
  2. 自动安装依赖并分别执行 `olivia.spec` 和 `olivia_onefile.spec`；
  3. 自动打包 `OliviaLetterBox.exe`、`OliviaLetterBox-win-x64.zip` 与 `BSide_Olivia_Lin.zip`；
  4. 自动创建 GitHub Release 并将三个二进制文件作为 Releases 资产上传上线。

---

## 四、核心架构与代码模块规范

```
BSide_Olivia_Lin/
├── config.json               ← 配置文件（协议/模型/端口/记忆路径/读信延迟）
├── app/
│   ├── server.py             ← stdlib HTTP 服务器（支持 GET 静态页、POST /api/letter、POST /api/memory）
│   └── static/               ← 前端静态应用（也是 B站 Toy 部署的根目录）
│       ├── index.html        ← 信箱主界面（纯相对路径，昼夜切换、火漆印章、打字机、设置抽屉、后悔处）
│       ├── css/style.css     ← 极简复古信纸样式
│       └── js/app.js         ← 前端交互核心（打字机、WebAudio 琴音、雨天 Canvas、3秒长按保护、后悔处、信件沉淀与批量导入）
├── skill/
│   ├── config.py             ← 动态配置加载与跨平台路径解耦
│   ├── model_client.py       ← 多协议大模型客户端（OpenAI / Gemini / Claude / Auto）
│   ├── memory_bank.py        ← 三级记忆库（L1工作/L2情景/L3长期，DELETED 软删除，后悔处密码校验与回归，distill_letters 幂等补记）
│   ├── local_engine.py       ← 本地离线人格回信引擎（情绪词典、长短信、天气匹配、记忆回声）
│   └── loader.py             ← 组装完整的 Prompt 注入块
├── persona/                  ← 林离人格建模（硬规则、身份、大五参数、语言风格、书信技艺）
└── samples/                  ← few-shot 代表性信件与验收用例
```

### 1. 多协议客户端关键机制 (`skill/model_client.py`)
- **自动协议识别 (`auto`)**：根据输入的 Endpoint 与 Model 名称自动智能路由到 `/v1/chat/completions`、`/v1/messages` 或 `generateContent`；
- **优雅降级**：端点不可达、超时或鉴权失败时，永远平滑回落到本地离线引擎，绝不阻断用户写信。

### 2. 记忆库软删除与安全机制 (`skill/memory_bank.py`)
- **DELETED 状态保护**：清空或删除记忆记录时，在 `data/memory.json` 中标记 `status: "DELETED"` 与 `deleted: true`，绝不物理抹除数据；
- **AI 提示词与前端过滤**：生成 Prompt 与常规前端展示时严格剔除 DELETED 项；
- **后悔处（回收站）**：验证管理密码（默认 `123456`，可在 `config.json` 中配置）后，支持单选、多选与全选批量恢复为 `ACTIVE` 状态。

### 3. 信件沉淀与批量导入（记忆补记管线）
- **服务端（源码 / EXE）**：`skill/memory_bank.distill_letters(letters, dry_run=False)` 幂等补记——
  - 以 `id` 优先、正文完全一致兜底判重；已 `DELETED` 的跳过且不复活；
  - 保留来信原时间戳与 `engine`（缺省 `"imported"`），`weather` / `mood` 缺省由本地引擎按正文推断；
  - 写入后按时间升序重排并重算 `total_letters` / `first_letter`；记忆库容量上限 200 条（超出时裁剪最早条目）；
  - HTTP：`POST /api/memory`，`{"action": "distill_letters", "letters": [{"text": "…", "reply": "…", "ts": "…"}]}`（`letters` 上限 500 条）；带 `"dry_run": true` 时只统计不落盘。
- **纯前端（Toy / 静态版）**：`src/letterImport.ts#parseLetterImport()` 解析批量导入文本（JSON：数组 / `letters|episodes|history|items|data` 容器 / 记忆文件结构 / 单封信；纯文本：一行 `---` 分隔多封、`【林离】` / `【回信】` 分隔回信）；`src/memoryBank.ts#distillLetters()` 在 LocalStorage 上实现同一套判重与补记规则。
- **UI 入口**：设置抽屉「信件沉淀与批量导入」区（沉淀按钮 + 导入弹窗）、信件存档抽屉「沉淀入记忆」按钮；导入的信件在存档与后悔处带「导入」徽标。
- **数据流**：导入 → 解析（`AppCore.parseLetters`）→ 写入信件存档（去重、按时间排序、上限 60）→ 自动沉淀进记忆（`distill_letters`，服务端不可用时降级到内嵌 `AppCore.distillLetters()`）→ 回写推断出的天气/心情与最终 id。

---

## 五、常用开发运维命令速查

```bash
# 启动本地开发服务（热重载配置）
python app/server.py

# 单元测试：分级记忆与软删除
python -c "from skill import memory_bank; print(memory_bank.get_summary())"

# Git 远程推送（走代理 7897）
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin <branch>

# Toy CLI 检查登录态与列表
toy whoami
toy mylist --json
```
