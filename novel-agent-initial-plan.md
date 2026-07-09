# AI 小说协作 Agent — Tauri 初始方案

## 1. 项目定位

一个轻量级桌面应用，用于 AI 辅助长篇小说创作。核心原则：
- **作者主导**：AI 协助，不代写
- **设定驱动**：围绕作者构建的世界观目录工作
- **文件透明**：直接读写本地 Markdown，作者随时可见
- **人机协作**：每步 Agent 操作需作者确认

---

## 2. 整体架构

```
┌─────────────────────────────────────────────┐
│  Tauri Desktop App (Rust + Web Frontend)    │
│  ┌─────────┬─────────────────┬────────────┐ │
│  │ 目录树   │   Monaco Editor  │  Agent     │ │
│  │ (文件)   │   (Markdown)     │  面板      │ │
│  │         │                  │            │ │
│  │         │                  │  • 对话     │ │
│  │         │                  │  • 设定检索 │ │
│  │         │                  │  • 节拍建议 │ │
│  │         │                  │  • 伏笔提醒 │ │
│  └─────────┴─────────────────┴────────────┘ │
│  技术: Tauri + React + Monaco Editor        │
└─────────────────────────────────────────────┘
                      ↑↓ IPC / WebSocket
┌─────────────────────────────────────────────┐
│  Python Agent Core (独立进程)                │
│  • 文件系统监听 & Markdown 解析              │
│  • 语义检索引擎                             │
│  • Agent 调度器 (可扩展角色)                  │
│  • LLM 适配层 (多模型切换)                   │
│  • SQLite 记忆层 (伏笔/人物状态/校验日志)     │
└─────────────────────────────────────────────┘
```

---

## 3. 目录结构

```
novel-agent/
├── tauri-app/                    # Tauri 前端 + Rust 壳
│   ├── src/
│   │   ├── main.tsx              # React 入口
│   │   ├── App.tsx               # 三栏布局主组件
│   │   ├── components/
│   │   │   ├── FileTree.tsx      # 左侧目录树
│   │   │   ├── Editor.tsx        # 中间 Monaco 编辑器
│   │   │   ├── AgentPanel.tsx    # 右侧 Agent 面板
│   │   │   ├── ChatMessage.tsx   # 对话气泡
│   │   │   └── ForeshadowingAlert.tsx  # 伏笔提醒
│   │   ├── hooks/
│   │   │   ├── useFileSystem.ts  # 文件操作 IPC
│   │   │   ├── useAgent.ts       # Agent 通信
│   │   │   └── useEditor.ts      # Monaco 绑定
│   │   └── types/
│   │       └── index.ts          # 类型定义
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs           # Rust 入口
│   │   │   ├── lib.rs            # 模块导出
│   │   │   ├── filesystem.rs     # 文件系统命令
│   │   │   ├── python_bridge.rs  # Python 进程管理
│   │   │   └── config.rs         # 配置管理
│   │   ├── Cargo.toml
│   │   └── tauri.conf.json
│   ├── package.json
│   └── vite.config.ts
│
├── agent-core/                   # Python Agent 后端
│   ├── main.py                   # 服务入口 (FastAPI / WebSocket)
│   ├── config.py                 # 配置
│   ├── core/
│   │   ├── __init__.py
│   │   ├── filesystem.py         # 目录监听 & Markdown 解析
│   │   ├── parser.py             # Markdown 结构解析
│   │   ├── retriever.py          # 语义检索 & 关联推荐
│   │   └── state.py              # 项目状态管理
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── base.py               # Agent 基类
│   │   ├── lore_keeper.py        # 设定顾问
│   │   ├── beat_maker.py         # 节拍师
│   │   ├── scribe.py             # 写手
│   │   ├── guardian.py           # 守夜人 (一致性校验)
│   │   └── foreshadowing_clerk.py # 伏笔官
│   ├── memory/
│   │   ├── __init__.py
│   │   ├── db.py                 # SQLite 连接
│   │   ├── foreshadowing.py      # 伏笔账本
│   │   ├── character_state.py    # 人物状态快照
│   │   └── continuity_log.py     # 校验日志
│   ├── llm/
│   │   ├── __init__.py
│   │   ├── adapter.py            # 统一接口
│   │   ├── openai_client.py      # OpenAI / 兼容 API
│   │   ├── claude_client.py      # Claude
│   │   └── ollama_client.py      # 本地 Ollama
│   └── prompts/
│       ├── lore_keeper.txt
│       ├── beat_maker.txt
│       ├── scribe.txt
│       ├── guardian.txt
│       └── foreshadowing_clerk.txt
│
├── docs/
│   └── architecture.md           # 详细架构文档
│
├── README.md
└── requirements.txt
```

---

## 4. 核心数据流

### 4.1 打开项目

```
用户选择目录 → Tauri Rust 端读取文件树 → 返回前端渲染目录树
         ↓
    Python 进程启动 (如未运行)
         ↓
    Python 扫描目录结构 → 建立索引 → 存入 SQLite
```

### 4.2 打开章节文件

```
用户点击 5.1.016-第十六章 过渡.md
         ↓
Tauri 读取文件内容 → 传给 Monaco Editor 显示
         ↓
通知 Python: "当前文件 = 5.1.016"
         ↓
Python retriever:
  1. 解析文件元数据 (卷号、章号、标题)
  2. 检索关联设定:
     - 同卷大纲 (5.1.1-第一卷大纲.md)
     - 前一章结尾 (5.1.015)
     - 关键词匹配设定文件 (世界/宗门/人物/功法)
  3. 查询伏笔账本: 本章是否有待兑现伏笔
         ↓
返回关联列表 → Agent 面板显示
```

### 4.3 Agent 交互流程 (以节拍师为例)

```
用户点击 "生成节拍"
         ↓
前端发送: {action: "generate_beats", chapter: "5.1.016", context: [...]}
         ↓
Python beat_maker Agent:
  1. 读取当前章节内容 + 关联设定
  2. 读取大纲中本章定位
  3. 构造 Prompt → 调用 LLM
  4. 返回结构化节拍 (JSON)
         ↓
前端显示节拍卡片 → 用户 [采纳] / [修改] / [忽略]
         ↓
[采纳] → 插入编辑器 (作为注释或大纲块)
```

### 4.4 保存时校验

```
用户按 Ctrl+S
         ↓
Tauri 写回磁盘
         ↓
通知 Python: "文件已保存"
         ↓
Python guardian Agent:
  1. 扫描本章内容
  2. 对比设定文件:
     - 人物境界是否矛盾
     - 宗门规则是否违反
     - 时间线是否冲突
     - 已埋伏笔状态是否一致
  3. 如有冲突 → 返回警告列表
         ↓
前端: 状态栏显示 ⚠️ 3个警告 → 点击展开详情
```

---

## 5. 文件系统规范

### 5.1 目录语义解析

你的目录结构本身就是知识图谱：

```
5-大玄系列/                    → 系列根
  5.0-基础设定/                → 设定类 (前缀 5.0)
    5.0.3-世界设定.md          → 叶子节点
    5.0.8-沧澜剑宗/            → 中间节点 (可展开)
      5.0.8.1-宗门总览.md
      5.0.8.4-弟子体系/
        5.0.8.4.1-弟子身份层级.md
  5.1-第一卷—沧澜初入/         → 卷 (前缀 5.1)
    5.1.1-第一卷大纲.md        → 大纲文件
    5.1.3-第一卷正文/
      5.1.016-第十六章 过渡.md  → 章节文件 (格式: {卷}.{章号:03d}-{标题}.md)
```

解析规则：
- 文件名前缀数字 = 层级编码 (5.0.8.4.1)
- 含 "大纲" = 大纲文件
- 含 "正文" 目录 = 存放章节
- 纯数字前缀 + 标题 = 章节文件

### 5.2 Markdown Frontmatter 规范

```markdown
---
id: "5.1.016"
title: "第十六章 过渡"
volume: "第一卷"
volume_id: "5.1"
chapter_number: 16
status: "draft"        # draft / review / finalized
word_count: 3200
tags: ["外门", "天赋测试", "沧澜剑宗"]
characters: ["主角", "外门执事", "神秘长老"]
foreshadowing_planted: ["fw_008"]   # 本章节埋下的伏笔ID
foreshadowing_resolved: []         # 本章节兑现的伏笔ID
prev_chapter: "5.1.015"
next_chapter: "5.1.017"
created_at: "2026-07-09"
updated_at: "2026-07-10"
---

# 第十六章 过渡

外门弟子们的窃窃私语在广场上回荡...
```

---

## 6. Agent 角色定义 (初始 5 个)

| Agent | 职责 | 触发方式 | 输出 |
|-------|------|---------|------|
| **设定顾问 (LoreKeeper)** | 回答设定相关问题，检索关联文件 | 用户提问 / 打开章节自动推送 | 文本回答 + 引用文件列表 |
| **节拍师 (BeatMaker)** | 根据大纲生成本章结构 | 用户点击"生成节拍" | 结构化节拍 (JSON) |
| **写手 (Scribe)** | 按节拍或用户指令生成段落 | 用户选中"写这段" | Markdown 文本 |
| **守夜人 (Guardian)** | 校验一致性 | 保存文件自动触发 | 警告列表 |
| **伏笔官 (ForeshadowingClerk)** | 跟踪伏笔埋设与兑现 | 用户标记"埋伏笔" / 打开章节检查 | 提醒 / 账本更新 |

每个 Agent = BaseAgent 子类：
- `system_prompt`: 从 `prompts/` 目录加载
- `input_schema`: 输入参数定义
- `output_schema`: 输出格式定义
- `execute()`: 核心逻辑

---

## 7. 技术栈

| 层 | 技术 | 版本/备注 |
|----|------|----------|
| 桌面壳 | Tauri | v2 |
| 前端框架 | React | v18 + TypeScript |
| 构建工具 | Vite | |
| 编辑器 | Monaco Editor | VS Code 同款 |
| Markdown 渲染 | markdown-it | 前端预览 |
| UI 组件 | 自建 / shadcn/ui | 保持轻量 |
| 通信 | Tauri IPC + WebSocket | IPC 用于文件，WS 用于 Agent |
| 后端 | Python | 3.11+ |
| Web 框架 | FastAPI | 或纯 WebSocket |
| Markdown 解析 | markdown + frontmatter | |
| 检索 | 规则匹配 + 可选向量检索 | 初期规则足够 |
| 数据库 | SQLite | 标准库 |
| LLM 调用 | 自建适配器 | 支持多模型 |

---

## 8. 开发阶段

### Phase 1: 骨架 (Week 1)
- [ ] Tauri 项目初始化，三栏布局
- [ ] 目录树组件，读取本地目录
- [ ] Monaco Editor 集成，打开/保存 Markdown
- [ ] Python 进程启动，基础通信

### Phase 2: 文件感知 (Week 2)
- [ ] Markdown 解析器 (Frontmatter + 内容)
- [ ] 目录语义解析 (层级/类型识别)
- [ ] 打开章节时自动检索关联设定
- [ ] Agent 面板显示关联文件列表

### Phase 3: 设定顾问 (Week 3)
- [ ] LoreKeeper Agent 实现
- [ ] 对话界面 (用户问 → Agent 查文件 → 回答)
- [ ] 引用溯源 (回答中标注来自哪个文件)

### Phase 4: 写作辅助 (Week 4)
- [ ] BeatMaker: 生成章节节拍
- [ ] Scribe: 按指令生成段落
- [ ] 插入编辑器功能

### Phase 5: 质量保障 (Week 5-6)
- [ ] Guardian: 保存时一致性校验
- [ ] ForeshadowingClerk: 伏笔账本
- [ ] 状态栏警告 / 伏笔提醒

### Phase 6: 进阶 (长期)
- [ ] 人物状态板可视化
- [ ] 关系图 / 势力图 (D3.js)
- [ ] 多模型切换 UI
- [ ] 导出功能 (EPUB / Word)

---

## 9. 快速启动命令

```bash
# 1. 克隆项目后，初始化 Tauri
cd novel-agent/tauri-app
npm install

# 2. 安装 Rust 依赖 (Tauri 自动处理)
# cd src-tauri && cargo build

# 3. 启动开发模式
npm run tauri dev

# 4. 另起终端，启动 Python 服务
cd ../agent-core
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

---

## 10. 关键设计决策

1. **文件即数据库**：所有设定/章节内容存在 Markdown 文件，SQLite 只存索引和元数据
2. **作者确认制**：Agent 生成内容不自动插入，需用户点击 [采纳]
3. **引用溯源**：Agent 回答必须标注信息来源文件
4. **本地优先**：所有数据本地存储，LLM 调用可配置为本地 Ollama
5. **可扩展 Agent**：新增 Agent 只需继承 BaseAgent + 写 Prompt + 注册到调度器

---

*此文档为初始方案，具体实现可根据开发过程调整。*
