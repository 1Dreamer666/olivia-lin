# BSide · 林离的信箱（Olivia Lin）书信陪伴复刻

> 《BSide: Olivia Lin》（米哈游「稻海桑田工作室」AI 陪伴应用）于 **2026-08-11 停止运营**。  
> 她的核心玩法「书信式 AI 陪伴」——你写信倾诉，她按人设回一封信，慢节奏、非即时聊天、每天三封——  
> 本项目将其完整**人格蒸馏**复刻，提供**在线免安装网页版**与 **Windows 桌面可执行程序**，作为永续纪念。

---

## 🌐 方式一：直接在浏览器中体验（B站 Toy 网页版）

无需下载安装任何软件，直接点击下方链接即可在浏览器中与林离书信互动：

👉 **[点击直接打开：BSide · 林离的信箱 (B站 Toy 在线版)](https://www.bilibili.com/toy/0sVLW1tfAFM7H4YA/index.html)**

### 在线版特色：
- **开箱即用**：免安装、全平台浏览器秒开，完整呈现复古信纸、信封飞行、火漆封缄、昼夜主题切换、雨天效果与 WebAudio 实时钢琴音；
- **智能双模式**：
  - **沉浸手写模式（默认）**：内置离线人格回信引擎，初次进入即可阅读林离留给你的第一封信；
  - **自定义大模型接入**：点击右上角「⚙ 系统设置」，可直接填入你的大模型 API 端点（支持 OpenAI、DeepSeek、Claude、Gemini、通义千问、Ollama 等）与 Key，在网页端享受大模型实时驱动的林离书信陪伴。

---

## 💻 方式二：Windows 客户端下载运行（单文件免解压 / 绿色便携版）

如果你希望在 Windows 电脑上本地离线运行，可前往 **[GitHub Releases 最新发布页](https://github.com/1Dreamer666/olivia-lin/releases/latest)** 直接下载：

| 版本文件 | 体积与类型 | 适用场景 | 下载地址 |
| :--- | :--- | :--- | :--- |
| **`OliviaLetterBox.exe`** | 45.8 MB（单文件独立版） | 极简体验，随处双击单文件直接运行，无需解压 | [直接下载](https://github.com/1Dreamer666/olivia-lin/releases/latest/download/OliviaLetterBox.exe) |
| **`OliviaLetterBox-win-x64.zip`** | 45.8 MB（绿色便携目录包） | 解压即用，毫秒级秒开，配置与记忆文件可在同级方便备份 | [直接下载](https://github.com/1Dreamer666/olivia-lin/releases/latest/download/OliviaLetterBox-win-x64.zip) |

### 桌面客户端使用说明：
1. **启动程序**：双击 `OliviaLetterBox.exe`，系统将自动启动服务并拉起默认浏览器展示信箱；
2. **写信与寄出**：在左侧信纸写下想对她说的话（快捷键 `Ctrl / ⌘ + Enter` 封缄寄出）；
3. **回信与打印**：稍作等待，右侧信纸将以复古打字机动画呈现林离的回信，点击「打印」可生成精美排版纸质信件。

---

## ✨ 核心特性与设计

### 1. 多协议大模型无缝兼容
在界面的「⚙ 系统设置」中支持配置多种主流大模型协议：
- **OpenAI 兼容协议**（通用标准）：支持 OpenAI 官方（GPT-4o）、DeepSeek（V3 / R1）、通义千问、OneAPI / NewAPI 中转站、本地 Ollama、LM Studio 等；
- **Anthropic Claude 协议**：支持 Claude 原生接口与 API Key；
- **Google Gemini 协议**：支持 Google 官方 REST API 与本地空壳代理；
- **Auto 模式**：根据填写的接口地址自动识别匹配协议。

### 2. 分级记忆系统与软删除保护
- **让回信记得之前的信**：自动建立工作记忆、情景记忆与长期语义画像（常聊主题、情绪轨迹、关键事件）；
- **重大决策 3 秒长按确认**：清空信件存档或清空记忆库必须按住 3 秒（带动态环形进度条与触感反馈），防止误操作；
- **标示 DELETED 保护机制**：清空与删除记忆绝不真正物理破坏文件数据，而是赋予 `DELETED` 状态，对 AI 提示词与前端主界面自动隐藏；
- **后悔处（回收站）**：随时可在信箱中进入「后悔处」（需输入管理密码，默认 `123456`），支持已删记忆的**单选、多选与全选批量回归**。

---

## 🐍 源码本地运行（Python 开发者）

```bash
# 1. 克隆代码仓库
git clone https://github.com/1Dreamer666/olivia-lin.git
cd olivia-lin/BSide_Olivia_Lin

# 2. 启动服务（零额外外部依赖，标准库驱动）
python app/server.py

# 3. 浏览器访问
http://127.0.0.1:8000
```

> 内部工程细节、B站 Toy 部署维护流、PyInstaller 构建与 CI Release 规范请参见：[DEVELOPER.md](./DEVELOPER.md)

---

## 📜 伦理与合规说明

林离（Olivia Lin）是米哈游旗下的**虚构角色 IP**。本项目为个人、非商业纪念性质，旨在停服后复刻其核心书信陪伴功能作为人格蒸馏技术演示。请勿用于商业运营或冒充真人。
