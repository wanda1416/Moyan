# 墨言 — 开发文档

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 桌面壳 | Tauri v2 (Rust) | 窗口管理、文件系统、进程桥接 |
| 前端 | React 18 + TypeScript + Vite | 三栏布局 UI |
| 编辑器 | Monaco Editor | Markdown 编辑与预览 |
| 后端 | Python 3.11+ / FastAPI | Agent 调度、语义检索、LLM 适配 |
| 数据库 | SQLite | 伏笔账本、人物状态、校验日志 |
| 存储 | `~/.moyan/` | settings.json（用户设置）+ workspace.json（工作区）+ projects/（项目状态与会话） |

---

## 架构决策

### 为什么用 Tauri 而不是 Electron

Tauri 使用系统 WebView，打包体积小（~5MB vs ~150MB），内存占用低，且 Rust 后端性能更好。对于文件密集型的小说创作工具，文件系统操作效率是关键。

### 为什么 Python Agent 是独立进程

Agent 核心需要调用 LLM API、做语义检索、管理 SQLite 记忆层，Python 生态更成熟。通过 WebSocket 与 Tauri 前端通信，解耦前后端，便于独立调试和替换。

### 为什么用 `~/.moyan/` 而不是项目内配置

应用配置、最近项目记录等属于用户级数据，不应跟随项目目录。`~/.moyan/` 提供跨项目的统一存储位置，类似 VS Code 的 `~/.vscode/`。

### 目录树状态为什么存在 Rust 侧

前端 `localStorage` 与 WebView 绑定，清除浏览器数据会丢失。存到 `~/.moyan/projects/project-{uid}.json` 更可靠，且与项目配置集中管理。

### 配置文件三级分层

- `settings.json`：用户设置，跨项目共享（LLM 配置、主题偏好）
- `workspace.json`：工作区上下文（最近项目列表、上次打开的项目）
- `projects/project-{uid}.json`：单个项目状态（目录树展开、当前文件）
- `projects/sessions-{uid}/`：单个项目的会话历史

分离后各文件职责清晰，用户设置不会与项目状态混在一起，会话历史按项目隔离。

---

## 已知问题

- `useEditor.ts` 存在未使用变量的 TS 警告（待清理）
- 窗口关闭时未显式保存项目状态（依赖防抖保存，极端情况下可能丢失最后一次操作）
