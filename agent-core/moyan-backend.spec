# -*- mode: python ; coding: utf-8 -*-
"""墨言 Python 后端 PyInstaller 打包配置

产物目录：agent-core/dist/moyan-backend/
脚本会把 prompts/llm/agents/core/memory 五个子目录一起打包。
"""
import sys
from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

# 收集需要包含的子模块
hiddenimports = []
for mod in [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    "google",
    "google.genai",
    "anthropic",
    "openai",
    "aiohttp",
    "fastapi",
    "pydantic",
    "websockets",
    "markdown",
    "frontmatter",
]:
    hiddenimports += collect_submodules(mod) if mod in sys.modules else [mod]

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("prompts", "prompts"),
        ("llm", "llm"),
        ("agents", "agents"),
        ("core", "core"),
        ("memory", "memory"),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "numpy",
        "pytest",
        "PIL",
        "scipy",
        "pandas",
        "PyQt5",
        "PyQt6",
        "wx",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    exclude_binaries=False,
    name="moyan-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# 使用 onefile 模式：所有依赖（_internal/）都内嵌到 moyan-backend.exe 中，
# 避免 NSIS 安装包漏掉 _internal/ 目录导致 sidecar 启动失败（找不到 python313.DLL）。
# 运行时 bootloader 会把内嵌资源解压到 %TEMP%/_MEIxxxxx，再启动解释器。
#
# 之前用 COLLECT 模式时，产物是：
#   dist/moyan-backend/moyan-backend.exe        (5.9 MB, 引导器)
#   dist/moyan-backend/_internal/python313.DLL  (6.1 MB)  + 其他 24 MB
# 但 NSIS bundle 只把 moyan-backend.exe 拷进安装目录，整个 _internal/ 被丢下了。

# (COLLECT step removed for onefile build)
