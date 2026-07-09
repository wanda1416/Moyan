# 墨言 — 项目开发总计划

> 基于 2026-07-10 代码状态的全量分析，层层拆解至可执行粒度。

---

## 一、现状总结

### 1.1 已完成（Phase 1 骨架 — 约 80%）

| 模块 | 完成项 | 状态 |
|------|--------|------|
| Tauri 壳 | v2 初始化、自定义标题栏、窗口控制、双击最大化、主题切换 | ✅ 完成 |
| 前端布局 | 三栏布局 (FileTree / Editor / AgentPanel)、Welcome 页 | ✅ 完成 |
| 文件操作 | 目录树读取、文件打开/保存 (文本/Markdown/图片预览) | ✅ 完成 |
| 状态持久化 | 目录树展开状态 + 当前文件恢复、config.json / state.json 分离 | ✅ 完成 |
| 启动脚本 | dev.ps1 / dev.bat / dev.sh 跨平台一键启动 | ✅ 完成 |
| Python 骨架 | FastAPI + WebSocket 入口、BaseAgent + Dispatcher、5 Agent stub | ✅ 骨架 |
| LLM 适配 | 接口定义 + OpenAI / Claude / Ollama 三个客户端骨架 | ✅ 骨架 |
| 记忆层 | SQLite 建表 (伏笔/人物状态/校验日志) + CRUD 操作 | ✅ 骨架 |
| 核心模块 | Markdown 解析器、项目状态管理、文件索引、规则检索 | ✅ 骨架 |
| 类型定义 | 前端 TypeScript 类型 (FileNode/AgentMessage/ChapterMeta 等) | ✅ 完成 |

### 1.2 关键缺口

| 缺口 | 严重度 | 说明 |
|------|--------|------|
| Python 进程管理 | 🔴 阻断 | Rust 侧 PythonBridge 全是 TODO，应用无法自动启动后端 |
| WebSocket 通信未接通 | 🔴 阻断 | AgentPanel 的 handleSend 是空壳，useAgent hook 未接入 |
| 5 个 Agent 核心逻辑 | 🔴 阻断 | 全部为 TODO stub，无实际 LLM 调用 |
| LLM 调用链路 | 🔴 阻断 | Agent → LLM 的调用路径不存在 |
| 配置持久化 & UI | 🟡 重要 | LLM 配置只在 config.py 内存，无 UI 设置界面 |
| 保存触发 Guardian | 🟡 重要 | Ctrl+S 不会触发一致性校验 |
| 打开文件自动推送 | 🟡 重要 | 打开章节不会自动检索关联设定 |
| 伏笔/人物状态集成 | 🟡 重要 | Agent 未调用 memory 层的 CRUD |
| Monaco Editor 缺失 | 🟠 期望 | 计划用 Monaco，实际用 textarea + ReactMarkdown |
| 状态栏缺失 | 🟠 期望 | 无字数统计、校验警告数、连接状态等 |
| FileSystemWatcher | 🟠 期望 | watchdog 未集成，文件变更不自动刷新索引 |

---

## 二、阶段规划总览

```
Phase 2: 通信贯通 ──────── Python 进程管理 + WebSocket 全链路 + 配置持久化
Phase 3: 设定顾问上线 ───── LoreKeeper Agent + 对话界面 + 引用溯源
Phase 4: 写作辅助 ───────── BeatMaker + Scribe + 节拍卡片 + 插入编辑器
Phase 5: 质量保障 ───────── Guardian 校验 + ForeshadowingClerk + 状态栏
Phase 6: 编辑器升级 ─────── Monaco Editor 替换 + 文件内交互 + 字数统计
Phase 7: 进阶功能 ───────── 人物状态板 + 关系图 + 导出 + 多模型切换 UI
```

---

## 三、Phase 2 — 通信贯通（预计 3-4 天）

> **目标**: 让 Tauri 前端能自动启动 Python 后端，并通过 WebSocket 完成一次完整的请求-响应循环。

### 2.1 Python 进程管理（Rust 侧） ✅ 已完成

**文件**: `tauri-app/src-tauri/src/python_bridge.rs`

- [x] **2.1.1** 实现 `PythonBridge::start()`
  - 定位 Python 解释器路径（优先 venv：`agent-core/.venv/Scripts/python.exe` on Windows）
  - 使用 `std::process::Command` 启动子进程（DETACHED_PROCESS）
  - 工作目录设为 `agent-core/`
  - 启动参数: `main.py`
  - 记录子进程 PID 用于后续清理
  - 错误处理: 路径不存在、启动失败时返回明确错误信息

- [x] **2.1.2** 实现 `PythonBridge::health_check()`
  - 向 `http://127.0.0.1:8765/health` 发送 HTTP GET
  - 使用 `reqwest` (blocking + async) 做 HTTP 客户端
  - 返回 bool 表示服务是否存活

- [x] **2.1.3** 实现 `PythonBridge::stop()`
  - Windows: `taskkill /PID /F`
  - Unix: `libc::kill(pid, SIGTERM)`
  - 清理 PID 记录

- [x] **2.1.4** 集成到 Tauri 应用生命周期
  - `lib.rs` 的 `setup` hook: 后台线程调用 `start_and_wait()` 自动启动
  - `on_window_event(Destroyed)`: 调用 `shutdown_python()` 清理进程
  - `manage(Mutex<PythonBridge>)` 注册 Tauri 状态

- [x] **2.1.5** 暴露 Tauri 命令
  - `start_python()` / `stop_python()` / `python_health_check()` / `python_status()` 命令
  - 注册到 `invoke_handler`
  - 前端 AgentPanel 通过状态指示器展示连接状态 + 手动重连按钮

**验证标准**: ✅ 启动应用 → Python 后端自动启动 → 前端绿点显示"已连接" → 退出时自动清理

### 2.2 WebSocket 通信全链路 ✅ 已完成

**前端侧**:

- [x] **2.2.1** 重构 `useAgent.ts`
  - 连接时机: 打开项目时自动 connect，关闭项目时 disconnect
  - 断线重连: 指数退避重试（1s → 2s → 4s → 8s，最大 30s）
  - 连接状态暴露: `connected: boolean`
  - 请求-响应匹配: send 返回 Promise，通过请求 ID 关联响应
  - 错误处理: 连接失败、超时、服务端错误的统一处理

- [x] **2.2.2** 重构 `AgentPanel.tsx`
  - 引入 `useAgent` hook
  - `handleSend` 实际调用 `send()` 方法
  - 显示连接状态指示器（绿点/红点）
  - 加载中状态: 发送后显示思考动画
  - 支持 Agent 类型选择（下拉框切换 5 个 Agent）
  - 消息列表自动滚动到底部
  - 清空对话按钮

- [x] **2.2.3** 打通文件上下文
  - 打开文件时，通知 Python 端 "当前文件 = xxx" (set_current_file)
  - Agent 请求自动携带当前文件路径
  - Python 端自动检索关联文件并返回

**Python 侧**:

- [x] **2.2.4** 完善 WebSocket 消息协议
  - 定义请求格式: `{ request_id, agent_type, action, payload }`
  - 定义响应格式: `{ request_id, success, agent_type, content, references, structured_data }`
  - 添加错误响应格式: `{ request_id, success: false, error_type, content }`
  - 特殊动作: `set_current_file` (设置当前文件+自动检索关联) / `ping` (心跳)
  - 自动注入当前文件上下文到 Agent 请求

**验证标准**: ✅ 前端 Agent 面板输入文字 → 发送 → Python 收到 → 返回响应 → 前端显示。打开文件自动通知 Python。

### 2.3 配置持久化 ✅ 已完成

- [x] **2.3.1** Python 配置从文件读写
  - `config.py` 改为从 `~/.moyan/config.json` 读取 LLM 配置
  - 保存时写回文件（合并写入，不覆盖其他字段）
  - 启动时自动加载 `settings.load()`
  - API Key 掩码显示

- [x] **2.3.2** 新增 `/api/config` 端点
  - `GET /api/config` — 返回当前配置（脱敏 API key）
  - `POST /api/config` — 更新配置并重写文件
  - 用于前端设置界面读写

**验证标准**: ✅ 修改 LLM 配置后重启，配置不丢失。

---

## 四、Phase 3 — 设定顾问上线 ✅ 已完成

> **目标**: LoreKeeper Agent 能真正回答设定问题，回答中标注信息来源文件。

### 3.1 LLM 调用链路贯通 ✅ 已完成

- [x] **3.1.1** 创建全局 LLM 实例
  - LoreKeeper 延迟初始化 LLM adapter（`_get_llm()`）
  - 根据 `settings.llm_provider` 通过工厂方法创建
  - 支持 OpenAI / Claude / Ollama 三条路径

- [x] **3.1.2** BaseAgent 增加 LLM 调用封装
  - LoreKeeper 内部 `self._llm` 引用
  - 错误处理: LLM 不可用时返回友好提示 + 检索结果
  - 异常捕获: 调用失败时返回降级响应

- [x] **3.1.3** 验证 LLM 调用
  - LLM 层已完整实现（adapter/openai_client/claude_client/ollama_client）
  - 工厂方法 `create_adapter()` 已注册三种 provider

### 3.2 LoreKeeper Agent 实现 ✅ 已完成

- [x] **3.2.1** 设定检索逻辑
  - 接收用户问题 + 当前文件路径
  - 通过 Retriever 匹配设定文件
  - 读取文件内容作为上下文（截取前 2000 字）

- [x] **3.2.2** 构造 Prompt 并调用 LLM
  - System prompt: 从 `prompts/lore_keeper.txt` 加载
  - 设定文件内容作为上下文注入
  - 调用 `llm.chat(messages)` 获取回答

- [x] **3.2.3** 引用溯源
  - 响应中 `references` 字段填充实际文件路径列表
  - 前端 ChatMessage 展示引用来源标签

- [x] **3.2.4** `get_references` action 完善
  - 返回关联设定文件列表 + 大纲 + 前后章

### 3.3 前端对话界面增强 ✅ 已完成

- [x] **3.3.1** Agent 面板对话完善
  - ChatMessage 展示 Agent 类型标签 + emoji
  - 引用文件列表展示（可悬停查看完整路径）
  - Agent 选择下拉框（5 个 Agent 切换）

- [x] **3.3.2** Agent 面板样式
  - 引用来源区域样式（背景色 + 标签）
  - 思考动画
  - 清空对话按钮

**验证标准**: 打开一个小说项目 → 打开章节 → Agent 面板自动显示关联设定 → 输入设定问题 → 得到带引用来源的回答。

---

## 五、Phase 4 — 写作辅助（预计 4-5 天）

> **目标**: BeatMaker 能生成章节节拍，Scribe 能按指令生成段落，结果可一键插入编辑器。

### 4.1 BeatMaker Agent 实现

**文件**: `agent-core/agents/beat_maker.py`

- [ ] **4.1.1** 上下文收集
  - 读取当前章节内容（通过 `project_state` 获取文件路径并读取）
  - 读取同卷大纲（通过 `Retriever._find_outline`）
  - 读取前后章内容摘要（前 500 字 + 后 500 字）
  - 读取关联设定文件（关键设定摘要）

- [ ] **4.1.2** 节拍生成
  - System prompt: 从 `prompts/beat_maker.txt` 加载
  - 构造包含大纲定位 + 前后章衔接 + 设定约束的 prompt
  - 调用 LLM，要求返回 JSON 格式节拍:
    ```json
    {
      "beats": [
        {"id": 1, "title": "开场", "type": "scene", "description": "...", "characters": [...], "key_points": [...]},
        ...
      ],
      "estimated_words": 3000,
      "tone": "紧张",
      "notes": "..."
    }
    ```
  - 解析 JSON 响应，容错处理

- [ ] **4.1.3** 节拍卡片前端
  - 新建 `BeatCard.tsx` 组件
  - 每个节拍显示: 序号、标题、描述、涉及角色、要点
  - 整体显示: 预估字数、基调、备注
  - 操作按钮: [全部采纳] [逐个采纳] [重新生成] [修改后采纳]

### 4.2 Scribe Agent 实现

**文件**: `agent-core/agents/scribe.py`

- [ ] **4.2.1** 段落生成
  - 输入: 用户指令 + 当前节拍 + 上下文（设定/前后文）
  - System prompt: 从 `prompts/scribe.txt` 加载
  - 构造 prompt: 包含风格要求、上下文、节拍要求
  - 调用 LLM 生成 Markdown 文本
  - 返回生成文本 + 字数统计

- [ ] **4.2.2** 内容扩写
  - 输入: 选中的文本 + 扩写指令（展开/细化/增加描写）
  - 保留原文上下文，调用 LLM 扩写
  - 返回扩写后的文本

- [ ] **4.2.3** 插入编辑器功能
  - Agent 响应中的文本块显示为可操作区域
  - [插入到光标位置] 按钮
  - [替换选中内容] 按钮（如果有选中文本）
  - [追加到文件末尾] 按钮
  - 插入操作通过 Tauri IPC 操作 Editor 内容

### 4.3 编辑器交互增强

- [ ] **4.3.1** 文本选中操作
  - Editor 组件暴露选中文本内容
  - 选中后在 Agent 面板显示快捷操作: "为此生成内容" / "扩写" / "润色"
  - 选中文本作为 Agent 请求的上下文自动携带

- [ ] **4.3.2** 内容插入接口
  - 新增 Tauri 命令或前端事件: `insert_to_editor(position, text)`
  - position: "cursor" | "end" | "replace_selection"
  - Editor 组件接收并执行插入

**验证标准**: 打开章节 → 点击 "生成节拍" → 显示节拍卡片 → 选择一个节拍 → 点击 "写这段" → Scribe 生成段落 → 点击 "插入" → 内容出现在编辑器中。

---

## 六、Phase 5 — 质量保障（预计 5-6 天）

> **目标**: Guardian 在保存时自动校验一致性，ForeshadowingClerk 管理伏笔生命周期，状态栏显示警告。

### 5.1 Guardian Agent 实现

**文件**: `agent-core/agents/guardian.py`

- [ ] **5.1.1** 一致性校验框架
  - 定义校验规则接口: `ValidationRule`
  - 实现规则注册与执行引擎
  - 校验结果统一为 `ValidationWarning` 列表

- [ ] **5.1.2** 人物境界校验
  - 从设定文件中提取人物境界信息
  - 从章节内容中检测人物境界描述
  - 对比是否矛盾（如: 设定中是先天境，章节中描写了金丹期能力）
  - 利用 LLM 辅助判断（规则 + LLM 混合模式）

- [ ] **5.1.3** 时间线校验
  - 从章节 Frontmatter 提取时间信息
  - 对比前后章时间线是否连续
  - 检测时间矛盾（如: 前章是三月，后章突然变成一月）

- [ ] **5.1.4** 设定一致性校验
  - 检查章节中提到的地名/宗门名/功法名是否与设定文件一致
  - 检查称谓是否正确（辈分/等级）
  - 利用设定文件作为参考，LLM 做判断

- [ ] **5.1.5** 伏笔一致性校验
  - 检查章节中提到的伏笔是否与伏笔账本一致
  - 已兑现的伏笔不应再次出现为 "未兑现" 状态

- [ ] **5.1.6** 保存触发集成
  - Python 端新增 `file_saved` WebSocket 事件处理
  - 前端 Ctrl+S 保存后 → 发送 `file_saved` 事件到 Python
  - Guardian 自动执行校验 → 返回警告列表
  - 前端接收并显示警告

### 5.2 ForeshadowingClerk Agent 完善

**文件**: `agent-core/agents/foreshadowing_clerk.py`

- [ ] **5.2.1** 伏笔埋设
  - 调用 `memory/foreshadowing.py` 的 `plant()` 方法
  - 自动生成伏笔 ID（格式: `fw_{timestamp}_{random}`）
  - 存入 SQLite
  - 返回确认 + 伏笔 ID

- [ ] **5.2.2** 伏笔兑现
  - 调用 `resolve()` 方法
  - 更新状态为 resolved
  - 记录兑现章节

- [ ] **5.2.3** 伏笔检查
  - 打开章节时自动查询相关伏笔
  - 显示: 本章埋下的伏笔 + 本章应兑现但未兑现的伏笔
  - 超期伏笔提醒（埋下后超过 N 章未兑现）

- [ ] **5.2.4** 伏笔面板
  - Agent 面板 "伏笔" tab 完善
  - 显示所有待兑现伏笔列表
  - 每条伏笔显示: ID、描述、埋设章节、已等待章数
  - 支持操作: [标记兑现] [编辑描述] [删除]

### 5.3 状态栏

- [ ] **5.3.1** 新建 `StatusBar.tsx` 组件
  - 位置: 应用底部（标题栏对称）
  - 显示信息:
    - 当前文件字数
    - Guardian 警告数（⚠️ 3）— 点击展开警告面板
    - 待兑现伏笔数（🔖 5）— 点击展开伏笔面板
    - Python 连接状态（🟢 已连接 / 🔴 未连接）
    - 当前 LLM 模型名称

- [ ] **5.3.2** 警告面板
  - 点击状态栏警告数展开
  - 显示 Guardian 返回的警告列表
  - 每条警告: 类型图标 + 消息 + 文件位置
  - 点击警告 → 跳转到对应文件和行号

### 5.4 人物状态管理集成

- [ ] **5.4.1** Guardian 保存人物状态
  - 校验完成后，提取章节中出现的人物及其状态
  - 调用 `memory/character_state.py` 的 `save_state()` 保存
  - 状态包括: 境界、位置、伤势、关系变化等

- [ ] **5.4.2** Agent 查询人物状态
  - LoreKeeper / Scribe 可查询人物最新状态
  - 作为上下文注入 prompt
  - 确保 LLM 回答基于最新人物状态

**验证标准**: 保存章节 → Guardian 自动校验 → 状态栏显示警告数 → 点击展开 → 看到具体矛盾点。埋设伏笔 → 后续章节收到兑现提醒。

---

## 七、Phase 6 — 编辑器升级（预计 3-4 天）

> **目标**: 用 Monaco Editor 替换 textarea，获得语法高亮、搜索替换、 minimap 等能力。

### 6.1 Monaco Editor 集成

- [ ] **6.1.1** 安装 Monaco Editor
  - `npm install monaco-editor` 或使用 `@monaco-editor/react`
  - 配置 Vite 的 Monaco 插件 (`vite-plugin-monaco-editor`)
  - 处理 Web Worker 配置

- [ ] **6.1.2** 替换 Editor.tsx 中的 textarea
  - Markdown 文件: 使用 Monaco 的 Markdown 模式
  - 文本文件: 根据扩展名自动匹配语言模式
  - 保留预览模式（ReactMarkdown 渲染）
  - 编辑/预览切换动画

- [ ] **6.1.3** 编辑器功能增强
  - 搜索替换 (Ctrl+F / Ctrl+H)
  - 行号显示
  - 光标位置显示（行:列）
  - 自动换行开关
  - 字体大小调整 (Ctrl+滚轮)
  - Minimap 开关
  - 撤销/重做 (Ctrl+Z / Ctrl+Y)

### 6.2 文件内交互

- [ ] **6.2.1** 文本选中 → Agent 操作
  - 监听 Monaco 的 selection 事件
  - 选中文本后显示浮动工具栏
  - 工具栏按钮: "查询设定" / "生成内容" / "润色" / "扩写"

- [ ] **6.2.2** 内联注释
  - Guardian 警告在对应行显示红色波浪线（Monaco markers）
  - 伏笔标记在对应行显示黄色高亮
  - 点击标记显示 hover 详情

### 6.3 字数统计与编辑信息

- [ ] **6.3.1** 实时字数统计
  - 监听 Monaco content change 事件
  - 统计中文字数 + 英文词数
  - 显示在状态栏

- [ ] **6.3.2** 文件修改状态
  - 显示文件是否已修改（未保存标记 •）
  - 与 Ctrl+S 保存联动

**验证标准**: Monaco Editor 正常加载 → 语法高亮 → 搜索替换可用 → 选中文本触发 Agent 操作 → 警告标记在行内显示。

---

## 八、Phase 7 — 进阶功能（长期迭代）

> **目标**: 可视化、导出、多模型等高级功能。

### 7.1 人物状态板

- [ ] **7.1.1** 人物列表视图
  - 从 SQLite 读取所有已记录人物
  - 显示: 姓名、最新境界、最后出现章节、当前状态摘要
  - 点击进入人物详情

- [ ] **7.1.2** 人物详情页
  - 境界变化时间线
  - 各章节状态快照对比
  - 人物关系网络（文本描述，暂不做图）

### 7.2 关系图 / 势力图

- [ ] **7.2.1** 引入 D3.js 或类似库
  - 从设定文件中提取人物关系
  - 力导向图可视化
  - 支持缩放、拖拽、点击查看详情

### 7.3 导出功能

- [ ] **7.3.1** Markdown 合并导出
  - 按卷合并所有章节为一个 Markdown 文件
  - 支持选择导出范围（单卷 / 全书 / 自定义）

- [ ] **7.3.2** EPUB 导出
  - 使用 Python `ebooklib` 或类似库
  - 生成标准 EPUB 格式
  - 支持封面、目录、元数据

- [ ] **7.3.3** Word 导出 (可选)
  - 使用 `python-docx` 转换
  - 保留基本格式

### 7.4 多模型切换 UI

- [ ] **7.4.1** 设置界面
  - 新建 Settings 页面或对话框
  - LLM Provider 选择（OpenAI / Claude / Ollama）
  - API Key 输入（密码框）
  - 模型名称选择/输入
  - Base URL 配置
  - 连接测试按钮
  - 保存配置

- [ ] **7.4.2** Agent 面板模型指示
  - 显示当前使用的模型
  - 快速切换下拉框

### 7.5 文件管理增强

- [ ] **7.5.1** 新建文件/目录
  - 右键菜单: 新建文件 / 新建目录
  - 自动按命名规范生成 Frontmatter 模板
  - 新文件自动加入索引

- [ ] **7.5.2** 文件重命名/移动
  - 右键菜单: 重命名 / 移动到...
  - 自动更新索引和关联引用

- [ ] **7.5.3** 文件删除
  - 右键菜单: 删除（移到回收站）
  - 确认对话框
  - 自动更新索引

### 7.6 快捷键系统

- [ ] **7.6.1** 命令面板 (Ctrl+Shift+P)
  - 搜索并执行所有可用命令
  - 类似 VS Code 的命令面板

- [ ] **7.6.2** 快捷键绑定
  - Ctrl+N: 新建文件
  - Ctrl+Shift+A: 打开 Agent 面板
  - Ctrl+G: 跳转到行
  - F5: 手动触发 Guardian 校验
  - 等

---

## 九、技术债务与代码质量

### 9.1 已知问题修复

- [ ] **9.1.1** `useEditor.ts` 未使用变量 TS 警告清理
- [ ] **9.1.2** 窗口关闭时显式保存项目状态（不依赖防抖）
- [ ] **9.1.3** Python `config.py` 的 `Settings` 改为支持从文件加载
- [ ] **9.1.4** `OllamaClient.is_available()` 中的同步/异步混用修复

### 9.2 代码规范

- [ ] **9.2.1** Python 端添加 type hints 全覆盖
- [ ] **9.2.2** 前端 ESLint + Prettier 配置
- [ ] **9.2.3** Rust clippy 警告清理
- [ ] **9.2.4** 添加基础单元测试
  - Python: `core/parser.py`、`core/retriever.py`、`memory/` 各模块
  - 前端: 组件渲染测试（可选）

### 9.3 性能优化

- [ ] **9.3.1** 大文件处理
  - 超过 100KB 的文件分块加载
  - Monaco 的大文件优化配置

- [ ] **9.3.2** 目录树优化
  - 大项目（1000+ 文件）的虚拟滚动
  - 懒加载子目录

- [ ] **9.3.3** Python 索引优化
  - 增量索引（只处理变更文件）
  - 索引缓存持久化

---

## 十、执行优先级与依赖关系

```
Phase 2 (通信贯通)
  ├── 2.1 Python 进程管理 ─────────── 无依赖，最高优先
  ├── 2.2 WebSocket 通信 ──────────── 依赖 2.1
  └── 2.3 配置持久化 ──────────────── 无依赖，可并行

Phase 3 (设定顾问)
  ├── 3.1 LLM 调用链路 ──────────── 依赖 Phase 2
  ├── 3.2 LoreKeeper 实现 ────────── 依赖 3.1
  └── 3.3 前端对话界面 ──────────── 依赖 2.2 + 3.2

Phase 4 (写作辅助)
  ├── 4.1 BeatMaker ─────────────── 依赖 Phase 3
  ├── 4.2 Scribe ────────────────── 依赖 3.1
  └── 4.3 编辑器交互 ────────────── 依赖 2.2

Phase 5 (质量保障)
  ├── 5.1 Guardian ──────────────── 依赖 Phase 3
  ├── 5.2 ForeshadowingClerk ────── 依赖 Phase 3
  ├── 5.3 状态栏 ────────────────── 依赖 5.1
  └── 5.4 人物状态 ──────────────── 依赖 5.1

Phase 6 (编辑器升级) ────────────── 可与 Phase 4/5 并行
Phase 7 (进阶功能) ──────────────── 依赖 Phase 5 完成
```

---

## 十一、每阶段交付物清单

| 阶段 | 交付物 | 验收标准 |
|------|--------|----------|
| Phase 2 | Python 自动启动 + WebSocket 通信 + 配置持久化 | 启动应用 → 后端自动运行 → 前端发消息有回应 |
| Phase 3 | LoreKeeper 可用 + 对话界面 + 引用溯源 | 问设定问题 → 得到带来源标注的回答 |
| Phase 4 | BeatMaker + Scribe + 插入编辑器 | 生成节拍 → 写段落 → 插入编辑器 |
| Phase 5 | Guardian + 伏笔管理 + 状态栏 | 保存触发校验 → 状态栏显示警告 → 伏笔跟踪 |
| Phase 6 | Monaco Editor + 内联交互 | 语法高亮 + 选中操作 + 警告标记 |
| Phase 7 | 人物板 + 导出 + 设置 UI | 各功能独立可用 |

---

## 十二、风险与备选方案

| 风险 | 影响 | 备选方案 |
|------|------|----------|
| Monaco Editor 打包体积过大 | 应用体积增加 | 降级为 CodeMirror 6 或保持 textarea + 增强 |
| LLM API 响应太慢 | 用户体验差 | 添加流式输出 (SSE/streaming)；支持 Ollama 本地模型 |
| Tauri Shell API 无法管理子进程 | Python 进程管理受阻 | 改用 dev.ps1 手动启动；或用 named pipe 通信 |
| 规则检索准确率不够 | 设定推荐不相关 | 引入 embedding 向量检索 (sentence-transformers) |
| SQLite 并发写入冲突 | 数据丢失 | 添加 WAL 模式；或使用写入队列 |

---

*此计划为全量拆解，实际执行时按 Phase 顺序推进，每个 Task 可独立交付和验证。*
