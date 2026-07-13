# 墨言 0.1.0 — 初始发布 / Initial Release

**墨言**是一款面向小说创作者的 AI 协作桌面应用，集成文件管理、Markdown 编辑、多 LLM 对话与语义检索，帮助作者在写作过程中随时获得 AI 辅助。

**Moyan** is an AI-powered desktop novel-writing assistant that integrates file management, Markdown editing, multi-LLM chat, and semantic retrieval to provide real-time AI support throughout the writing process.

---

## ✨ 功能亮点 / Features

### 🖥️ 应用框架 / Application Framework
- 基于 Tauri v2 + React 18 + TypeScript 构建，轻量高效
- 自定义标题栏与菜单栏（VS Code 风格），支持双击最大化
- 浅色 / 深色主题切换，偏好持久化
- 三栏布局：文件树 / 编辑器 / Agent 对话面板
- Built on Tauri v2 + React 18 + TypeScript — lightweight and performant
- Custom title bar & menu bar (VS Code style) with double-click maximize
- Light / Dark theme switching with preference persistence
- Three-column layout: File Tree / Editor / Agent Panel

### 📁 文件管理 / File Management
- 目录树浏览器，展开状态跨会话持久化
- 完整文件操作：新建、重命名、删除、复制、剪切、粘贴（含右键菜单与快捷键）
- 内联编辑（重命名 / 新建直接在树节点内完成）
- VS Code 风格 Activity Bar，支持文件搜索（模糊匹配，300ms 防抖）
- Directory tree browser with persistent expand state across sessions
- Full file operations: create, rename, delete, copy, cut, paste (context menu + shortcuts)
- Inline editing (rename / create directly in tree nodes)
- VS Code-style Activity Bar with fuzzy file search (300ms debounce)

### 📝 编辑器 / Editor
- Monaco Editor 集成，支持 Markdown 编辑与图片预览（base64）
- 多 Tab 管理，关闭前未保存变更三选项确认（保存 / 不保存 / 取消）
- 状态栏字数统计
- 当前文件状态持久化，重启后自动恢复
- Monaco Editor integration for Markdown editing and image preview (base64)
- Multi-tab management with unsaved-changes confirmation (Save / Don't Save / Cancel)
- Word count in status bar
- Current file state persisted and auto-restored on restart

### 🤖 多 LLM 供应商 / Multi-LLM Support
- 支持 OpenAI、Claude (Anthropic)、Ollama (本地)、Gemini (Google) 四大供应商
- 多供应商管理：添加、编辑、删除、一键切换默认
- 测试连接 + 自动拉取模型列表
- HTTP 代理配置（按供应商独立开关）
- Supports OpenAI, Claude (Anthropic), Ollama (local), Gemini (Google)
- Multi-provider management: add, edit, delete, one-click switch default
- Test connection + auto-fetch model list
- Per-provider HTTP proxy configuration

### 💬 AI 对话 / AI Chat
- 实时对话，AI 回复支持 Markdown 渲染（标题、列表、代码块、引用、表格）
- 当前编辑文件自动注入对话上下文，切换文件即时更新
- 会话历史管理：新建、切换、删除，自动保存，跨会话持久化
- Real-time chat with Markdown rendering for AI responses (headings, lists, code blocks, quotes, tables)
- Current file auto-injected into chat context, updates on file switch
- Session history: create, switch, delete with auto-save and cross-session persistence

### 🔍 RAG 语义检索 / Semantic Retrieval
- 基于 fastembed + FAISS 的项目文件语义索引
- 支持全量构建与增量刷新（MD5 差异检测，仅重新编码变动文件）
- 检索结果自动增强对话回复
- Project file semantic indexing powered by fastembed + FAISS
- Full build and incremental refresh (MD5 diff, only re-encode changed files)
- Retrieved context enhances chat responses

### 💾 数据与配置 / Data & Configuration
- 三级配置分层：用户设置 / 工作区 / 项目状态，职责清晰
- 欢迎页 + 最近项目列表，快速恢复上次工作
- 应用数据统一存储在 `~/.moyan/`，与项目目录分离
- 旧版配置自动迁移
- Three-tier config: user settings / workspace / project state
- Welcome page + recent projects for quick resume
- Unified data storage at `~/.moyan/`, separated from project directory
- Automatic migration from legacy config formats

### 📦 打包与更新 / Packaging & Updates
- PyInstaller onedir 模式打包 Python 后端，秒启动无解压延迟
- NSIS 安装包（Windows），sidecar 无黑窗口
- 启动后异步检查 GitHub Release 新版本，标题栏更新气泡提示
- 关于页面显示版本号、许可协议（AGPL-3.0 非商业）
- Python backend packaged with PyInstaller onedir mode — instant startup, no extraction delay
- NSIS installer (Windows), sidecar runs without console window
- Async update check via GitHub Releases after startup, update bubble in title bar
- About page with version info and license (AGPL-3.0 non-commercial)

---

## 🛠️ 技术栈 / Tech Stack

| 层 / Layer | 技术 / Technology |
|---|---|
| 桌面壳 / Desktop Shell | Tauri v2 (Rust) |
| 前端 / Frontend | React 18 + TypeScript + Vite |
| 编辑器 / Editor | Monaco Editor |
| 后端 / Backend | Python 3.13 + FastAPI + uvicorn |
| 语义检索 / Retrieval | fastembed + FAISS |
| 打包 / Packaging | PyInstaller (onedir) + NSIS |

---

## 📥 安装 / Installation

1. 前往 [Releases](https://github.com/wanda1416/Moyan/releases) 页面
2. 下载 `Moyan_0.1.0_x64-setup.exe`
3. 运行安装程序，按提示完成安装
4. 启动墨言，在欢迎页选择项目目录即可开始

1. Go to the [Releases](https://github.com/wanda1416/Moyan/releases) page
2. Download `Moyan_0.1.0_x64-setup.exe`
3. Run the installer and follow the prompts
4. Launch Moyan, select a project directory on the welcome page to get started

---

## ⚠️ 已知限制 / Known Limitations

- 仅支持 Windows（macOS / Linux 待后续支持）
- 首次启动需等待 sidecar 后端初始化（约 2-3 秒）
- 窗口关闭时极端情况下可能丢失最后一次目录树操作（依赖防抖保存）
- Windows only (macOS / Linux support planned for future releases)
- Initial startup requires sidecar backend initialization (~2-3 seconds)
- Edge case: last directory tree operation may be lost on window close (debounce save)

---

## 📄 许可证 / License

[AGPL-3.0 附加非商业使用限制](../LICENSE)

本项目允许个人使用、学术研究和非商业目的的自由使用与修改。商业使用需另行获得授权。

[AGPL-3.0 with Non-Commercial Restriction](../LICENSE)

This project is free to use and modify for personal, academic, and non-commercial purposes. Commercial use requires separate authorization.
