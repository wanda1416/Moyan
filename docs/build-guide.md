# 墨言 — 打包与发布指南

本文档介绍如何把墨言源码打包成可在 Windows / macOS 上直接安装的桌面应用。

## 一、产物形态

| 平台 | 安装包格式 | 内部 sidecar 名称 |
|------|-----------|------------------|
| Windows | NSIS `.exe` + MSI | `moyan-backend-x86_64-pc-windows-msvc.exe` |
| macOS（Apple Silicon） | `.app` + `.dmg` | `moyan-backend-aarch64-apple-darwin` |
| macOS（Intel） | `.app` + `.dmg` | `moyan-backend-x86_64-apple-darwin` |
| Linux | AppImage / deb | `moyan-backend-x86_64-unknown-linux-gnu` |

> 注：当前 Tauri 仓库 `tauri.conf.json` 的 `targets` 字段已经声明了 `nsis / msi / app / dmg` 四种格式，跨平台编译时只会生成与目标平台匹配的部分。

## 二、环境准备（首次构建）

### 通用依赖

- **Node.js 18+**（含 npm）
- **Rust 工具链**（stable，推荐通过 [rustup](https://rustup.rs) 安装）
- **Tauri 2 系统依赖**：
  - Windows：Microsoft C++ Build Tools、Edge WebView2（Win11 自带）
  - macOS：Xcode Command Line Tools
  - Linux：`libwebkit2gtk-4.1-dev`、`libssl-dev`、`libgtk-3-dev` 等（参见 Tauri 官方文档）

### Python 后端依赖

`agent-core/.venv` 虚拟环境必须就位且包含 `requirements.txt` 全部包。

```bash
# Windows
cd agent-core
python -m venv .venv
.venv\Scripts\activate
pip install -r ..\requirements.txt
pip install pyinstaller   # 打包用

# macOS / Linux
cd agent-core
python3 -m venv .venv
source .venv/bin/activate
pip install -r ../requirements.txt
pip install pyinstaller
```

> PyInstaller 的依赖不写进 `requirements.txt`，避免污染运行期 venv。

### 验证

```bash
# 1. Python 后端能独立启动
cd agent-core
source .venv/bin/activate   # 或 .venv\Scripts\activate
python main.py
# 浏览器访问 http://127.0.0.1:8765/health 验证返回 ok

# 2. Tauri dev 能起 UI
cd tauri-app
npm install
npm run tauri dev
```

## 三、一键构建

### Windows

```bat
cd Moyan
build.bat
```

### macOS / Linux

```bash
cd Moyan
chmod +x build.sh
./build.sh
# 想显式指定目标三元组：
./build.sh aarch64-apple-darwin
./build.sh x86_64-apple-darwin
```

### 流程拆解

一键脚本会按顺序执行：

1. **`scripts/build-backend.{bat,sh}`**
   - 激活 `agent-core/.venv`
   - 调用 `pyinstaller moyan-backend.spec --noconfirm`
   - 产物：`agent-core/dist/moyan-backend/moyan-backend[.exe]`
2. **`scripts/copy-sidecar.{bat,sh}` `<target-triple>`**
   - 把 PyInstaller 产物复制到 `tauri-app/src-tauri/binaries/moyan-backend-<triple>[.exe]`
   - 非 Windows 平台加 `chmod +x`
3. **`tauri build`**
   - 自动执行 `npm run build`（`beforeBuildCommand`）
   - 用 `externalBin` 找到上一步放的 sidecar
   - 产出安装包到 `tauri-app/src-tauri/target/release/bundle/`

## 四、单独构建（调试用）

如果只想跑其中一步：

```bash
# 仅打包 Python 后端
bash scripts/build-backend.sh

# 仅构建前端
bash scripts/build-frontend.sh

# 仅拷贝 sidecar
bash scripts/copy-sidecar.sh aarch64-apple-darwin
```

## 五、产物路径

构建成功后，所有产物都在：

```
tauri-app/src-tauri/target/release/bundle/
├── nsis/                 # Windows NSIS 安装包
│   └── 墨言_0.1.0_x64-setup.exe
├── msi/                  # Windows MSI
│   └── 墨言_0.1.0_x64_en-US.msi
├── macos/                # macOS
│   ├── 墨言.app/
│   └── 墨言_0.1.0_aarch64.dmg
└── deb/                  # Linux（如果 targets 包含）
    └── moyan_0.1.0_amd64.deb
```

文件名由 Tauri 按 `productName` + `version` + 架构自动拼装。

## 六、应用内更新检测

`tauri-app/src-tauri/src/updater.rs` 提供两个 Tauri 命令：

| 命令 | 说明 | 返回值 |
|------|------|--------|
| `check_update()` | 拉取 GitHub Releases 最新版本 | `UpdateInfo { has_update, current_version, latest_version, release_url, ... }` |
| `app_version()` | 读取 `Cargo.toml` 中的版本 | `String`（如 `"0.1.0"`） |

### GitHub 仓库信息来源

**不再 hardcode**。`tauri-app/src-tauri/build.rs` 在编译期执行 `git remote get-url origin`，自动解析出 owner 和 repo，并通过 `cargo:rustc-env` 注入到 `updater.rs`。

支持的远端 URL 形式：

```
git@github.com:wanda1416/Moyan.git        # SSH
https://github.com/wanda1416/Moyan.git    # HTTPS
https://github.com/wanda1416/Moyan        # HTTPS（无 .git）
```

**覆盖方式**（用于 fork 或私有仓库）：

```bash
# Windows (PowerShell)
$env:MOYAN_GITHUB_OWNER = "your-name"
$env:MOYAN_GITHUB_REPO  = "your-fork"
npm run tauri build

# macOS / Linux
MOYAN_GITHUB_OWNER=your-name MOYAN_GITHUB_REPO=your-fork ./build.sh
```

**降级行为**：如果既没有可用的 git 远端也没设环境变量，build.rs 会注入 `"unknown"`，`check_update` 直接返回错误，前端会静默吞掉（启动 3 秒后的气泡检测失败不阻塞 UI）。

发布新版本时，到 GitHub 仓库发一个 `vX.Y.Z` 格式的 tag + Release，桌面端启动 3 秒后就会拉取并弹出更新气泡。

## 七、dev / prod 启动模式

`tauri-app/src-tauri/src/python_bridge.rs` 定义了 `LaunchMode`：

| 模式 | 触发条件 | Python 来源 |
|------|----------|------------|
| `Dev` | `cargo build` 时带 `cfg!(debug_assertions)`（即 `cargo run` / `tauri dev`） | `agent-core/.venv/bin/python main.py` |
| `Sidecar` | `cargo build --release` / `tauri build` | `resources/binaries/moyan-backend`（PyInstaller 产物） |

切换模式无需改任何代码，编译时自动决定。

## 八、常见问题

### 1. 端口被占用

```
Error: 端口 8765 已被进程 PID 12345 占用
```

**解决**：关闭占用进程，或修改 `tauri-app/src-tauri/src/python_bridge.rs` 里的 `PythonConfig::default().port`。

### 2. PyInstaller 缺模块

启动 sidecar 后报 `ModuleNotFoundError: xxx`：

1. 在 `agent-core/moyan-backend.spec` 的 `hiddenimports` 列表里加该模块名
2. 重跑 `scripts/build-backend.{bat,sh}`

### 3. macOS Gatekeeper 拦截

未签名的 `.app` 双击会弹"无法打开，因为开发者无法验证"。

**绕过**：右键 → 打开 → 弹窗里再点"打开"。

**彻底解决**：需要 Apple Developer ID 证书 + `tauri.conf.json` 配置 `bundle.macOS.signingIdentity`，本期不做。

### 4. Windows Defender 误报

未签名的 sidecar exe 偶尔会被 Defender 隔离。

**绕过**：把 `tauri-app/src-tauri/target/release/bundle/` 加进 Defender 白名单。

**彻底解决**：申请代码签名证书（EV 或普通 OV），给 `moyan-backend.exe` 和 Tauri 产物签名。

### 5. sidecar 找不到

应用启动报 `找不到 sidecar 可执行文件 (moyan-backend)`：

- 检查 `tauri-app/src-tauri/binaries/` 下是否有 `moyan-backend-<你的三元组>[.exe]`
- 文件名必须**严格**匹配 `rustc -vV` 的 host triple，否则 Tauri 不会打包

### 6. GitHub API 限流

未鉴权 60 次/小时/IP。启动时的 3 秒延迟 + "检查更新"按钮可手动重试，**不会**触发限流。

## 九、CI/CD（后续可加）

骨架在 `墨言打包发布方案_*.md` 计划文档里：`.github/workflows/release.yml`，触发条件 `push tags: v*`，矩阵 `windows-latest` / `macos-latest`。本期只做本地构建脚本，CI 留待下一版。

## 十、修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `agent-core/moyan-backend.spec` | 新增 | PyInstaller 打包配置 |
| `agent-core/main.py` | 微调 | 增加 `--host/--port` 命令行参数 |
| `scripts/build-backend.bat` / `.sh` | 新增 | 打包 Python 后端 |
| `scripts/build-frontend.bat` / `.sh` | 新增 | 构建前端 |
| `scripts/copy-sidecar.bat` / `.sh` | 新增 | 拷贝 sidecar 到 Tauri |
| `build.bat` / `build.sh` | 新增 | 根目录一键构建入口 |
| `tauri-app/src-tauri/tauri.conf.json` | 修改 | 加 `externalBin` 和 `targets` |
| `tauri-app/src-tauri/src/python_bridge.rs` | 重构 | 支持 dev / sidecar 双模式 |
| `tauri-app/src-tauri/src/lib.rs` | 修改 | 根据编译模式选择启动路径 |
| `tauri-app/src-tauri/src/updater.rs` | 新增 | `check_update` / `app_version`（仓库信息来自 build.rs 注入） |
| `tauri-app/src-tauri/build.rs` | 修改 | 注入 `GITHUB_OWNER` / `GITHUB_REPO` 编译期常量 |
| `tauri-app/src/components/TitleBar.tsx` | 微调 | 集成更新气泡 |
| `tauri-app/src/components/Settings.tsx` | 加 Tab | "关于" 面板（版本 + 检查更新） |
| `tauri-app/src/App.tsx` | 微调 | 启动 3 秒后调用 `check_update` |
| `docs/build-guide.md` | 新增 | 本文档 |
