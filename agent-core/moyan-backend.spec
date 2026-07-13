# -*- mode: python ; coding: utf-8 -*-
"""墨言 Python 后端 PyInstaller 打包配置

产物目录：agent-core/dist/moyan-backend/
脚本会把 prompts/llm/agents/core/memory 五个子目录一起打包。
"""
import os
import sys
from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

# 确保 venv site-packages 在 modulegraph 搜索路径中
# 优先使用 spec 文件同级 .venv（避免 pyinstaller 命令解析到系统 Python）
try:
    _spec_dir = SPECPATH  # PyInstaller 内置变量
except NameError:
    _spec_dir = os.getcwd()
_site_pkgs = os.path.join(_spec_dir, ".venv", "Lib", "site-packages")
if not os.path.isdir(_site_pkgs):
    # fallback: 基于 sys.executable
    _site_pkgs = os.path.join(os.path.dirname(os.path.dirname(sys.executable)), "Lib", "site-packages")
if not os.path.isdir(_site_pkgs):
    import site as _site_mod
    _paths = [p for p in _site_mod.getsitepackages() if os.path.isdir(p)]
    _site_pkgs = _paths[0] if _paths else ""

# 将 venv site-packages 加入 sys.path，确保 collect_submodules 能找到已安装的包
# （spec 文件运行在 Python 解释器中，可能是系统 Python 而非 venv）
if _site_pkgs and _site_pkgs not in sys.path:
    sys.path.insert(0, _site_pkgs)

# 收集需要包含的子模块（始终 collect_submodules 以确保内部依赖链完整）
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
    # RAG: fastembed (ONNX Runtime)
    "fastembed",
    "onnxruntime",
    "tokenizers",
    "faiss",
    "numpy",
    "PIL",  # fastembed.ImageEmbedding 依赖
]:
    try:
        hiddenimports += collect_submodules(mod)
    except Exception:
        hiddenimports.append(mod)

import glob as _glob
_onnx_dlls = _glob.glob(os.path.join(_site_pkgs, "onnxruntime", "capi", "*.dll"))
_onnx_binaries = [(f, os.path.join("onnxruntime", "capi")) for f in _onnx_dlls]

a = Analysis(
    ["main.py"],
    pathex=[_site_pkgs] if _site_pkgs else [],
    binaries=_onnx_binaries,
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
    runtime_hooks=["runtime_hook_onnx.py"],
    excludes=[
        "tkinter",
        "matplotlib",
        "pytest",
        # PIL/Pillow: fastembed.ImageEmbedding 依赖，不可排除
        "scipy",
        "pandas",
        "PyQt5",
        "PyQt6",
        "wx",
        # RAG 瘦身：排除 PyTorch 生态（已迁移到 ONNX Runtime）
        # 注意：numpy 是基础依赖（fastembed/onnxruntime/rag 均依赖），不可排除
        "torch",
        "transformers",
        "sentence_transformers",
        "sympy",
        "sklearn",
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
