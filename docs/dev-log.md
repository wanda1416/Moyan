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

## 开发记录

### 2026-07-10 项目脚手架搭建

- Tauri v2 + React 18 + TypeScript 初始化
- 三栏布局骨架：左侧 FileTree / 中间 Editor / 右侧 AgentPanel
- Python agent-core 目录结构建立（agents / core / llm / memory / prompts）
- Monaco Editor 集成，支持 Markdown 文件打开与保存

### 2026-07-10 应用数据目录与欢迎页

- Rust 层新增 `app_dir.rs`，管理 `~/.moyan/` 目录生命周期
- 实现 `init_app_dir` / `read_app_config` / `write_app_config` / `add_recent_project` 命令
- 启动时自动创建 `~/.moyan/` 及 `config.json`
- 前端新增 `Welcome.tsx`，支持最近项目列表、打开目录对话框
- `App.tsx` 实现 welcome ↔ project 两态切换

### 2026-07-10 多格式文件预览

- `filesystem.rs` 新增 `read_file_base64` 命令，支持图片文件读取
- 前端 `isImageFile()` 判断扩展名，图片走 base64 预览，文本走 Editor
- `Editor.tsx` 根据文件类型切换渲染模式

### 2026-07-10 自定义标题栏

- `tauri.conf.json` 设置 `decorations: false`，隐藏原生窗口装饰
- 新增 `TitleBar.tsx`：VS Code 风格菜单栏（文件/编辑/帮助）+ 窗口控制按钮
- 实现最大化状态监听（`onResized`），动态切换最大化/还原图标
- 窗口控制：`minimize` / `toggleMaximize` / `close`
- 配置 `capabilities` 声明窗口操作权限（`core:window:allow-*`）

### 2026-07-10 许可证与文档

- 采用 AGPL-3.0 附加非商业使用限制条款
- 创建 `LICENSE` 文件，明确禁止商业使用、要求衍生作品开源
- 创建 `README.md`，包含项目介绍、架构、技术栈、快速开始
- `Cargo.toml` / `package.json` / `tauri.conf.json` 统一品牌名为"墨言"

### 2026-07-10 跨平台一键启动脚本

- 创建 `dev.ps1`（PowerShell）、`dev.bat`（CMD）、`dev.sh`（Bash）
- 脚本逻辑：启动 Python 后端 → 启动 Tauri 开发模式 → 退出时清理后端进程
- Windows 脚本使用 UTF-8 编码处理中文路径
- Python 解释器使用 venv 内的绝对路径，避免依赖系统全局 Python

### 2026-07-10 目录树展开状态持久化

- Rust 层新增 `save_tree_state` / `load_tree_state` 命令
- 状态存储于 `~/.moyan/config.json` 的 `project_states` 字段，以项目路径为 key
- `FileTree.tsx` 重构：展开状态从各节点本地 `useState` 提升到组件级 `Set<string>`
- 首次打开项目：自动展开根节点
- 再次打开：恢复上次展开状态
- 防抖保存（500ms）：展开/收起操作后自动持久化
- `App.tsx` 在关闭项目、切换项目前显式调用 `saveTreeState()`
- 根节点不允许收起

### 2026-07-10 当前文件恢复

- 扩展 `save_tree_state` / `load_tree_state` 支持存储当前打开的文件路径
- 配置格式升级为对象：`{ expanded_paths, current_file }`
- 项目状态存储从 `config.json` 拆分到独立的 `state.json`，配置与状态分离
- `FileTree` 新增 `onReady` 回调，加载完成后通知 App 恢复文件
- `App.tsx` 通过 `currentFileRef` 同步跟踪当前文件，供防抖保存和显式保存使用
- 打开项目时自动恢复上次编辑的文件（文件不存在则跳过）

### 2026-07-10 深色/浅色主题切换

- CSS 重构：`:root` 仅保留布局常量，主题色彩通过 `[data-theme]` 属性选择器切换
- 浅色主题（默认）：白底 + 深色文字 + 蓝色强调色
- 深色主题：保留原 Catppuccin Mocha 配色方案
- 新增 `--shadow` / `--error` 主题变量，替代硬编码颜色值
- `TitleBar.tsx` 新增"视图"菜单，包含浅色/深色主题选项，当前主题显示 ✓ 标记
- `App.tsx` 启动时从 `config.json` 读取 `theme` 字段，切换时即时写入保存
- 通过 `document.documentElement.setAttribute("data-theme", theme)` 实现全局切换

### 2026-07-10 LLM 配置功能真实性修复

- 修复 `config.py` 重复 Settings 类定义导致配置方法丢失的问题
- 新增 Python `/api/test_llm` 端点：真正创建 LLM adapter 发送测试请求
- 新增 Python `/api/list_models` 端点：获取可用模型列表（OpenAI `/v1/models`、Ollama `/api/tags`、Claude 固定列表）
- Rust `test_llm_connection` 改为代理到 Python `/api/test_llm`，传入完整配置参数
- Rust `save_config` 改为异步，保存文件后 POST 到 Python `/api/config` 同步内存配置
- `Settings.tsx` 传 config 参数给测试命令，测试成功后自动拉取模型列表填充下拉框
- 菜单分割线从文本模拟改为 `separator: true`，风格统一

### 2026-07-10 PythonBridge 进程管理修复

- 修复 `find_agent_core_dir()` 未覆盖兄弟目录搜索（`tauri-app/` 与 `agent-core/` 平级）
- `resolve_python_path()` 优先使用 venv Python，避免使用系统 Python
- 启动时打印 Python 路径和 agent-core 路径，方便排查
- `Stdio::null()` 改为 `Stdio::inherit()`，Python 日志直接输出到控制台
- 端口占用检测：检测到占用时报错提示 PID，不再主动杀进程
- 进程清理：`taskkill /PID /F` 改为 `/T /F` 杀整棵进程树（含 uvicorn worker）
- uvicorn 启动改为 `reload=False` + 直接传 app 对象，避免 Windows multiprocessing 产生多余进程
- 安装 `openai` / `anthropic` 依赖到 venv，`requirements.txt` 取消注释

### 2026-07-10 多 LLM 供应商配置重构

- 配置格式从单一供应商改为多供应商管理：`config.json` 新增 `active_provider_id` + `llm_providers[]` 数组
- Rust 新增 `LLMProviderEntry` 结构体（id/name/provider/api_key/base_url/model），`LLMConfig` 改为包含 providers 列表
- Python `Settings` 新增 `llm_providers` + `active_provider_id` 字段，旧字段改为 `@property` 从激活供应商读取（agent 代码无需改动）
- 旧格式自动迁移：检测到 `llm_provider` 字段但无 `llm_providers` 时，自动转换并写回新格式
- `/api/test_llm`、`/api/list_models` 改为接收单个 provider entry 参数
- `Settings.tsx` 完全重写为左右分栏布局：左侧供应商列表（点击切换、删除、默认标记），右侧编辑面板
- 支持添加/删除多个供应商（至少保留一个），"设为默认供应商"按钮切换激活项
- 新增供应商列表、分栏布局相关 CSS 样式

### 2026-07-10 设置页面细节修复

- 删除 `health_check_async` 死代码方法，消除编译警告
- 供应商 ID 生成改用 `crypto.randomUUID()`，避免组件重挂载时 ID 冲突导致多项同时选中
- 新建供应商默认 base_url/model 改为空，切换类型时始终填充该类型默认值（修复 Ollama 默认 URL 错误）
- 删除按钮添加 ✕ 图标（之前内容为空不可见）
- 删除操作增加 `confirm()` 确认框，防止误删
- 成功提示颜色适配双主题：浅色主题深绿色 `#1a8a1a`，深色主题保持 `#a6e3a1`
- 默认供应商增加绿色左边框视觉标识

### 2026-07-10 对话架构简化与日志系统

- 对话功能从 WebSocket + Agent 路由简化为 HTTP POST `/api/chat` 直接调用 LLM
- 前端 `AgentPanel.tsx` 简化：移除 Agent 选择下拉，使用 `sendChat` HTTP 方法
- 修复 React stale closure 问题：`useAgent.ts` 用 `messagesRef` 追踪最新消息
- 新增文件日志系统：后端 `~/.moyan/logs/backend.log`（RotatingFileHandler），前端 `~/.moyan/logs/frontend.log`（Rust `write_log` 命令）
- 新增 `useLogger.ts` hook，前端可调用 `info/warn/error` 记录日志
- 健康检查从 5 秒轮询改为启动时检查一次
- 清理所有 5 个 Agent 文件的重复类定义（Python 用最后一个定义，导致完整实现被骨架覆盖）

### 2026-07-10 Gemini 原生 API 适配

- 新增 `gemini_client.py`，使用 `google-genai` 新版 SDK（旧版 `google-generativeai` 已停止维护）
- 消息格式使用 `types.Content` + `types.Part.from_text()` 构造（不能用字典，否则 Pydantic 校验失败）
- `system_instruction` 单独提取到 `GenerateContentConfig`
- 模型列表通过 `client.models.list()` 动态获取，筛选 `supported_actions` 包含 `generateContent` 的模型
- 新增 HTTP 代理配置：供应商配置增加 `proxy` + `use_proxy` 字段，支持勾选是否启用代理
- 代理设置通过环境变量 `HTTP_PROXY` / `HTTPS_PROXY` 注入
- 设置页面新增 Gemini 下拉选项、HTTP 代理勾选框

### 2026-07-10 配置文件三级分层重构

- 配置存储从 `config.json` + `state.json` 重构为三级结构：
  - `settings.json`：用户设置（LLM 配置、主题）
  - `workspace.json`：工作区上下文（最近项目列表、上次打开的项目）
  - `projects/project-{uid}.json`：单个项目状态（目录树展开、当前文件）
- Rust `app_dir.rs` 完全重写，新增路径函数和迁移逻辑
- Python `config.py` 路径统一为 `settings.json`
- 删除废弃的 `config.rs` 模块
- 新增 `remove_recent_project` 命令，最近项目支持 ✕ 按钮移除（不删除项目状态文件）
- 旧 `config.json` / `state.json` 自动迁移到新结构

### 2026-07-10 对话历史功能

- 新增会话持久化存储，每个项目的会话独立保存
- 存储结构：`~/.moyan/projects/sessions-{uid}/sessions.json`（索引）+ `session-{id}.json`（消息）
- Rust 新增 6 个命令：`list_sessions` / `load_session` / `save_session` / `delete_session` / `get_current_session` / `set_current_session`
- `useAgent.ts` 扩展会话管理：`sessions` / `currentSessionId` / `loadSessions` / `switchSession` / `deleteSession` / `startNewSession`
- 每次收到 LLM 回复后自动保存当前会话
- 会话标题自动取第一条用户消息前 20 字符
- `AgentPanel.tsx` 新增会话选择器下拉菜单，显示历史会话列表（按更新时间倒序）
- 当前会话高亮显示，hover 显示删除按钮
- "+ 新对话" 按钮创建空白会话（自动保存当前会话后切换）
- 移除"清空当前对话"按钮，避免数据丢失

### 2026-07-10 打包发布系统与 Sidecar 双模式启动

- 新增 PyInstaller 打包配置 `agent-core/moyan-backend.spec`，将 Python 后端打包为独立可执行文件
- `python_bridge.rs` 引入 `LaunchMode` 枚举（`Dev` / `Sidecar`），根据编译模式自动选择启动方式
  - Dev 模式：使用 venv 中的 `python main.py`，通过 `--host` / `--port` 命令行参数传地址
  - Sidecar 模式：使用打包好的 `moyan-backend` 二进制，路径按优先级自动定位（exe 同目录 → resources/binaries → 工作目录）
- `agent-core/main.py` 新增 `argparse` 解析 `--host` / `--port`，兼容 sidecar 注入与 dev 默认值
- `build.rs` 新增 GitHub 远端解析逻辑：从 `git remote get-url origin` 提取 owner/repo，作为编译期常量注入 `updater.rs`，支持环境变量 `MOYAN_GITHUB_OWNER` / `MOYAN_GITHUB_REPO` 覆盖
- `tauri.conf.json` 配置 `externalBin` 指向 `binaries/moyan-backend`，bundle targets 明确为 `nsis` / `app` / `dmg`
- 新增跨平台构建脚本：
  - `build.bat` / `build.sh`：一键执行 Python 打包 → sidecar 拷贝 → tauri build → 产物归集
  - `scripts/build-backend.bat/sh`：PyInstaller 打包 Python 后端
  - `scripts/build-frontend.bat/sh`：独立前端构建
  - `scripts/copy-sidecar.bat/sh`：按平台 triple 拷贝 sidecar 到 Tauri binaries 目录
  - `scripts/collect-artifacts.bat/sh`：从 Tauri target 目录归集最终安装包到 `dist/`
- `docs/build-guide.md`：完整的打包发布指南文档
- `.gitignore` 新增 `.qoder/`、`tauri-app/src-tauri/binaries/`、`tauri-app/src-tauri/target/` 忽略规则

### 2026-07-10 应用更新检测与关于页面

- 新增 `updater.rs`：通过 GitHub Releases API 检查新版本，包含 SemVer 比较、draft/prerelease 过滤
- 启动 3 秒后异步检查更新，不阻塞 UI，失败静默
- 标题栏右侧新增更新提示气泡：脉冲动画圆点 + 版本号，点击打开浏览器跳转 release 页面，✕ 按钮关闭（本次会话不再弹）
- 设置页面新增"关于"Tab：
  - 应用简介、当前版本号（等宽字体 + 绿色 badge）
  - 手动检查更新按钮 + 最新版本显示 + "前往下载页"按钮
  - 许可协议信息（AGPL-3.0 非商业）
- "帮助"菜单 → "关于墨言" 从 disabled 改为打开关于 Tab
- `Settings.tsx` 支持 `initialTab` prop，菜单/气泡可指定打开目标 Tab
- 新增更新气泡、关于 Tab 相关 CSS 样式

### 2026-07-11 RAG 索引增量刷新与项目设置页

- `agent-core/rag/index.py` 重构：新增 `_compute_file_hash`（MD5）、`_load_manifest` / `_save_manifest` 辅助方法
- `build_index()` 改造：按文件分组 chunk，持久化 `embeddings.npy`（全量向量矩阵）+ `manifest.json`（文件哈希 + chunk 映射）
- 新增 `refresh_index()` 增量刷新方法：对比文件 MD5 分三类（unchanged / modified+new / deleted），仅对变动文件重新编码，无 manifest 时 fallback 到全量构建
- Python `main.py` 新增 `POST /api/rag/refresh_index` 端点
- Rust `app_dir.rs` 新增 `refresh_rag_index` / `delete_rag_index` 命令
- 前端 `ProjectSettings.tsx` 新增三个索引管理按钮：刷新索引（增量）、重建索引（全量）、删除索引，按钮区与检索区增加间距

### 2026-07-11 Sidecar 路径解析修复

- 修复 `python_bridge.rs` 中 `resolve_sidecar_path()` 仅查找 `moyan-backend.exe` 的问题
- Tauri `externalBin` 打包后文件名带 target triple 后缀（如 `moyan-backend-x86_64-pc-windows-msvc.exe`）
- `resolve_sidecar_path()` 改为生成多个候选文件名（含 target triple 后缀），逐一查找，覆盖 Windows / macOS / Linux

### 2026-07-11 文件树浏览器功能增强

- Rust `filesystem.rs` 新增 5 个文件操作命令：`create_file` / `create_directory` / `delete_entry` / `rename_entry` / `copy_entry`（目录支持递归复制）
- `FileTree.tsx` 全面重写，新增：
  - 右键上下文菜单：新建文件、新建文件夹、重命名、删除、复制、剪切、粘贴、刷新
  - 内联重命名：input 替换节点名称，Enter 确认 / Escape 取消
  - 内联新建：在目录子节点区域渲染 input，支持新建文件/文件夹
  - 剪贴板状态管理：copy / cut 模式 + paste 执行
  - 键盘快捷键：F2（重命名）、Delete（删除）、Ctrl+C/X/V（复制/剪切/粘贴）
  - 删除确认对话框：浮层组件，防止误删
- CSS 新增：`.context-menu` 系列、`.file-tree-node-input`、`.confirm-overlay/dialog`、`.btn-danger` 样式

### 2026-07-11 AI 消息 Markdown 渲染

- `ChatMessage.tsx` 对 AI 消息使用 `react-markdown` + `remark-gfm` 渲染，支持标题、列表、代码块、引用、表格、链接等
- 用户消息保持纯文本
- 新增 `.chat-text.markdown-body` 样式，覆盖所有 Markdown 元素，使用 CSS 变量适配亮/暗主题
- 样式同步更新 `agent-panel.css` 和 `styles.css`

### 2026-07-11 后端路由模块化拆分

- `agent-core/main.py` 从 565 行精简为 ~120 行入口文件
- 提取 `routes/` 子目录按职责组织路由模块：
  - `routes/llm.py`：LLM 配置/测试/模型列表
  - `routes/chat.py`：对话（文件上下文注入 + RAG 增强）
  - `routes/rag.py`：RAG 索引管理（构建/刷新/检索/状态）
  - `routes/ws.py`：WebSocket Agent 通信
- `routes/__init__.py` 统一导出 register 函数

### 2026-07-11 Activity Bar 与文件搜索

- 新增 VS Code 风格 Activity Bar（48px 宽图标栏），支持在文件树和搜索面板之间切换
- 新增 `ActivityBar.tsx` 组件，文件夹图标 + 搜索图标，带激活态左侧竖线指示器
- 新增 `SearchPanel.tsx` 组件，300ms 防抖搜索，显示文件名 + 相对路径，点击结果打开文件
- Rust `filesystem.rs` 新增 `search_files` 命令，递归搜索项目目录，模糊匹配文件名（不区分大小写）
- `App.tsx` 布局重构：`ActivityBar` + `sidebar`（按 `sidebarView` 状态切换文件树/搜索面板）
- 新增 `activity-bar.css`、`search-panel.css` 样式文件

### 2026-07-11 文件树交互细节修复

- 修复右键菜单在点击其他文件节点时不消失的问题：`FileTreeNode` 新增 `onCloseContextMenu` 回调，点击节点时主动关闭菜单
- 文件树底部增加 80px 留白，为未来空白区域右键菜单预留空间
- 右键菜单增加视口边界检测：菜单超出底部或右侧时自动向上/向左偏移，保留 8px 安全边距

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
