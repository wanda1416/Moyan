# PyInstaller 打包故障排查：fastapi 模块丢失

> 日期：2026-07-13
> 影响：PyInstaller 打包产物缺少 fastapi 等 venv 专属依赖，sidecar 启动报 `ModuleNotFoundError`

## 故障现象

打包后的桌面应用启动失败，sidecar 日志（`~/.moyan/logs/sidecar.log`）显示：

```
ModuleNotFoundError: No module named 'fastapi'
[PYI-xxxxx:ERROR] Failed to execute script 'main' due to unhandled exception!
```

但**手动运行** `agent-core\dist\moyan-backend.exe` 却能正常启动 uvicorn。

## 排查过程

### 第一阶段：spec 文件配置修复

**1. numpy 被错误排除**

`moyan-backend.spec` 的 `excludes` 列表包含 `"numpy"`，但 RAG 模块（`rag/index.py`、`rag/embedder.py`）和 fastembed/onnxruntime 都依赖 numpy。

修复：从 `excludes` 中移除 numpy，添加到 `hiddenimports`。

**2. faiss 未打包**

`import faiss` 写在函数内部（懒加载），PyInstaller 静态分析检测不到。

修复：添加 `"faiss"` 到 `hiddenimports` 列表。

**3. collect_submodules 条件判断失效**

原代码：
```python
hiddenimports += collect_submodules(mod) if mod in sys.modules else [mod]
```
spec 执行时包尚未导入 `sys.modules`，条件为 False，只添加了顶层名字。

修复：始终调用 `collect_submodules`，用 `try/except` 兜底。

**4. pathex 为空导致 modulegraph 找不到模块**

`Analysis` 的 `pathex=[]`，PyInstaller 的模块搜索路径不完整。

修复：显式将 venv site-packages 路径添加到 `pathex`。

以上修复后，**手动运行** PyInstaller 产物从 28MB 增至 104MB，包含 48 个 fastapi 子模块，手动执行 exe 成功。

### 第二阶段：手动成功 vs Tauri 启动失败

通过 sidecar 日志确认 Tauri 加载的 exe 路径为 `C:\Users\wanghui\AppData\Local\墨言\moyan-backend.exe`。

对比三个位置的 exe 文件大小：

| 位置 | 大小 | 状态 |
|------|------|------|
| `agent-core\dist\moyan-backend.exe` | 104MB | ✅ 新版（含 fastapi） |
| `tauri-app\src-tauri\binaries\*.exe` | 104MB | ✅ 已同步 |
| `AppData\Local\墨言\moyan-backend.exe` | 51MB | ❌ 旧版 |

结论：安装目录的 exe 是旧版，需要完整 `build.bat` + 重新安装。

### 第三阶段：完整重建后仍然失败

用户执行完整 `build.bat` 并重新安装后，sidecar 日志显示：

```
文件大小: 28881833 bytes
ModuleNotFoundError: No module named 'fastapi'
```

**28MB —— 产物又回到了旧版大小！** 说明 PyInstaller 重新打包时 fastapi 再次丢失。

### 第四阶段：定位根因

在 spec 文件中添加调试输出后，发现关键信息：

```
[SPEC DEBUG] sys.executable: C:\Users\wanghui\AppData\Local\Python\pythoncore-3.13-64\python.exe
[SPEC DEBUG] _site_pkgs: C:\Users\wanghui\AppData\Local\Python\pythoncore-3.13-64
[SPEC DEBUG] fastapi in hiddenimports: 0 modules
```

**根因：`pyinstaller` 命令解析到了系统 Python，而非 venv Python。**

用户的系统上安装了全局 Python 3.13（`C:\Users\wanghui\AppData\Local\Python\pythoncore-3.13-64\`），`build-backend.bat` 虽然调用了 `activate.bat`，但 `pyinstaller.exe` 是系统级安装的，其 `sys.executable` 指向系统 Python。导致：

1. `_site_pkgs` 基于 `sys.executable` 计算 → 指向系统 Python 目录（没有 fastapi）
2. `collect_submodules("fastapi")` 用系统 Python 的 import 系统搜索 → 返回 0 个模块
3. 产物 exe 只有 28MB，缺少所有 venv 专属依赖

## 修复方案

### 修复 1：build-backend.bat 使用 `python -m PyInstaller`

```bat
REM 修改前
pyinstaller moyan-backend.spec --noconfirm

REM 修改后
python -m PyInstaller moyan-backend.spec --noconfirm
```

`python -m PyInstaller` 确保使用当前 venv 的 Python 解释器运行 PyInstaller。

### 修复 2：spec 文件显式将 venv site-packages 加入 sys.path

```python
# 优先使用 SPECPATH（spec 文件所在目录）定位 venv
try:
    _spec_dir = SPECPATH  # PyInstaller 内置变量
except NameError:
    _spec_dir = os.getcwd()

_site_pkgs = os.path.join(_spec_dir, ".venv", "Lib", "site-packages")

# 关键：将 venv site-packages 加入 sys.path
# spec 文件运行在 Python 解释器中，可能是系统 Python 而非 venv
if _site_pkgs and _site_pkgs not in sys.path:
    sys.path.insert(0, _site_pkgs)
```

这样即使 `pyinstaller` 命令意外使用系统 Python，`collect_submodules` 也能通过 `sys.path` 找到 venv 中的包。

### 修复 3：sidecar 启动时清除干扰环境变量

`python_bridge.rs` 中启动 sidecar 前显式移除可能干扰 PyInstaller 的环境变量：

```rust
let mut child = std::process::Command::new(sidecar_path.as_os_str())
    .env_remove("PYTHONHOME")
    .env_remove("PYTHONPATH")
    .env_remove("PYTHONNOUSERSITE")
    .env_remove("PYTHONDONTWRITEBYTECODE")
    // ...
```

## 修复后验证

```
[SPEC DEBUG] _site_pkgs: C:\...\agent-core\.venv\Lib\site-packages  ✅
[SPEC DEBUG] fastapi in hiddenimports: 48 modules                    ✅
产物大小: 112MB                                                      ✅
```

## 经验教训

1. **`pyinstaller` 命令 ≠ `python -m PyInstaller`**：当系统存在多个 Python 环境时，`pyinstaller` 可执行文件可能解析到非预期的 Python 解释器。始终使用 `python -m PyInstaller` 确保使用当前环境的 Python。

2. **`sys.executable` 不可信**：spec 文件中基于 `sys.executable` 计算路径时，它可能指向系统 Python 而非 venv。应优先使用 `SPECPATH`（spec 文件所在目录）来定位项目内的 venv。

3. **`collect_submodules` 依赖运行环境的 `sys.path`**：即使 `pathex` 设置正确（影响 PyInstaller Analysis 阶段），`collect_submodules` 在 spec 执行阶段使用的是 Python 的 import 系统，需要 `sys.path` 包含目标包的路径。

4. **产物大小是快速诊断指标**：fastapi 等大包缺失会导致产物体积显著变化（28MB vs 112MB），可作为打包是否完整的第一判断依据。

5. **sidecar 日志至关重要**：没有日志时 sidecar 崩溃是"黑盒"；有了 stdout/stderr 捕获和诊断信息（文件大小、环境变量、工作目录），可以快速缩小问题范围。

## 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `scripts/build-backend.bat` | `pyinstaller` → `python -m PyInstaller` |
| `agent-core/moyan-backend.spec` | 基于 SPECPATH 定位 venv；`sys.path.insert` 确保 collect_submodules 可用 |
| `tauri-app/src-tauri/src/python_bridge.rs` | sidecar 启动添加诊断日志；`env_remove` 清除 Python 环境变量 |
