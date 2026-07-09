# 墨言 — AI 小说协作桌面应用

一个轻量级桌面应用，用于 AI 辅助长篇小说创作。

## 核心理念

- **作者主导**：AI 协助，不代写
- **设定驱动**：围绕作者构建的世界观目录工作
- **文件透明**：直接读写本地 Markdown，作者随时可见
- **人机协作**：每步 Agent 操作需作者确认

## 架构概览

```
┌─────────────────────────────────────────────┐
│  Tauri Desktop App (Rust + React)           │
│  ┌─────────┬─────────────────┬────────────┐ │
│  │ 目录树   │   Monaco Editor  │  Agent     │ │
│  │         │   (Markdown)     │  面板      │ │
│  └─────────┴─────────────────┴────────────┘ │
└─────────────────────────────────────────────┘
                      ↑↓ IPC / WebSocket
┌─────────────────────────────────────────────┐
│  Python Agent Core                          │
│  • Markdown 解析 & 语义检索                  │
│  • Agent 调度器 (可扩展角色)                  │
│  • LLM 适配层 (多模型切换)                   │
│  • SQLite 记忆层 (伏笔/人物状态/校验日志)     │
└─────────────────────────────────────────────┘
```

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Tauri v2 (Rust) |
| 前端 | React 18 + TypeScript |
| 编辑器 | Monaco Editor |
| 构建 | Vite |
| 后端 | Python 3.11+ / FastAPI |
| 数据库 | SQLite |
| LLM | 多模型适配 (OpenAI / Claude / Ollama) |

## Agent 角色

| Agent | 职责 |
|-------|------|
| **设定顾问** (LoreKeeper) | 检索关联设定文件，回答设定问题 |
| **节拍师** (BeatMaker) | 根据大纲生成章节结构节拍 |
| **写手** (Scribe) | 按节拍或用户指令生成段落 |
| **守夜人** (Guardian) | 保存时自动校验一致性（境界/时间线/伏笔） |
| **伏笔官** (ForeshadowingClerk) | 跟踪伏笔的埋设与兑现 |

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (最新稳定版)
- [Python](https://www.python.org/) 3.11+

### 安装与运行

```bash
# 1. 克隆项目
git clone <repo-url>
cd Moyan

# 2. 安装前端依赖
cd tauri-app
npm install

# 3. 启动 Tauri 开发模式
npm run tauri dev

# 4. 另起终端，启动 Python Agent 后端
cd agent-core
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
python main.py
```

## 项目结构

```
Moyan/
├── tauri-app/          # Tauri 桌面应用 (Rust + React)
│   ├── src/            # 前端源码
│   ├── src-tauri/      # Rust 后端
│   └── package.json
├── agent-core/         # Python Agent 后端
│   ├── agents/         # Agent 角色实现
│   ├── core/           # 核心模块 (解析/检索/状态)
│   ├── llm/            # LLM 适配层
│   ├── memory/         # 记忆层 (SQLite)
│   └── prompts/        # Agent 提示词
└── docs/               # 文档
```

## 设计决策

1. **文件即数据库** — 设定/章节存储在 Markdown 文件，SQLite 只存索引和元数据
2. **作者确认制** — Agent 生成内容不自动插入，需用户点击采纳
3. **引用溯源** — Agent 回答标注信息来源文件
4. **本地优先** — 数据全部本地存储，LLM 可配置为本地 Ollama
5. **可扩展 Agent** — 新增 Agent 只需继承 BaseAgent + 编写 Prompt + 注册调度器

## 许可证

本项目采用 [AGPL-3.0 附加非商业使用限制](./LICENSE) 授权。

- 允许自由使用、修改和分发
- 衍生作品必须以相同许可证开源
- **禁止商业使用**
