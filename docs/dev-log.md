# 墨言 — 开发文档

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 桌面壳 | Tauri v2 (Rust) | 窗口管理、文件系统、进程桥接 |
| 前端 | React 18 + TypeScript + Vite | 三栏布局 UI |
| 编辑器 | Monaco Editor | Markdown 编辑与预览 |
| 后端 | Python 3.11+ / FastAPI | Agent 调度、语义检索、LLM 适配 |
| 数据库 | SQLite | 伏笔账本、人物状态、校验日志 |
| 存储 | `~/.moyan/` | config.json（固定配置）+ state.json（项目状态） |

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

---

## 架构决策

### 为什么用 Tauri 而不是 Electron

Tauri 使用系统 WebView，打包体积小（~5MB vs ~150MB），内存占用低，且 Rust 后端性能更好。对于文件密集型的小说创作工具，文件系统操作效率是关键。

### 为什么 Python Agent 是独立进程

Agent 核心需要调用 LLM API、做语义检索、管理 SQLite 记忆层，Python 生态更成熟。通过 WebSocket 与 Tauri 前端通信，解耦前后端，便于独立调试和替换。

### 为什么用 `~/.moyan/` 而不是项目内配置

应用配置、最近项目记录等属于用户级数据，不应跟随项目目录。`~/.moyan/` 提供跨项目的统一存储位置，类似 VS Code 的 `~/.vscode/`。

### 目录树状态为什么存在 Rust 侧

前端 `localStorage` 与 WebView 绑定，清除浏览器数据会丢失。存到 `~/.moyan/state.json` 更可靠，且与项目配置集中管理。

### config.json 与 state.json 分离

`config.json` 存储固定配置（最近项目、LLM 设置、Python 连接等），用户主动修改才会变化；`state.json` 存储项目运行时状态（目录树展开、当前文件），随用户操作频繁更新。分离后两者互不干扰，避免状态写入影响配置读取。

---

## 已知问题

- `useEditor.ts` 存在未使用变量的 TS 警告（待清理）
- 窗口关闭时未显式保存项目状态（依赖防抖保存，极端情况下可能丢失最后一次操作）
