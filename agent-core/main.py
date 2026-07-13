"""
Novel Agent - AI 小说协作后端
服务入口：FastAPI + WebSocket
"""

import sys
import os

# ── Frozen environment diagnostics (non-blocking, onedir mode) ──
# In onedir mode, _MEIPASS points to _internal/ next to the exe (no %TEMP% extraction)
if getattr(sys, 'frozen', False):
    import threading
    def _diag():
        import time
        time.sleep(0.5)  # let uvicorn start first
        _exe = sys.executable
        _meipass = getattr(sys, '_MEIPASS', 'N/A')
        _size = os.path.getsize(_exe) if os.path.isfile(_exe) else -1
        print(f"[DIAG] === Frozen Environment ===", file=sys.stderr)
        print(f"[DIAG] exe: {_exe}", file=sys.stderr)
        print(f"[DIAG] exe size: {_size} bytes", file=sys.stderr)
        print(f"[DIAG] _MEIPASS: {_meipass}", file=sys.stderr)
        print(f"[DIAG] Python: {sys.version}", file=sys.stderr)
        # Check critical imports after server is up
        for _mod in ['fastapi', 'uvicorn', 'pydantic', 'numpy', 'PIL', 'onnxruntime', 'faiss']:
            try:
                __import__(_mod)
                print(f"[DIAG] import {_mod}: OK", file=sys.stderr)
            except Exception as _e:
                print(f"[DIAG] import {_mod}: FAIL - {_e}", file=sys.stderr)
        print(f"[DIAG] ===========================", file=sys.stderr)
    threading.Thread(target=_diag, daemon=True).start()

import logging
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings, get_moyan_dir
from core.state import ProjectState
from memory.db import Database
from debug_page import register_debug_routes
from routes import (
    register_llm_routes,
    register_chat_routes,
    register_rag_routes,
    register_ws_routes,
)


def setup_logging():
    """配置文件日志"""
    log_dir = get_moyan_dir() / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    file_handler = RotatingFileHandler(
        log_dir / "backend.log",
        maxBytes=5 * 1024 * 1024,  # 5MB
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )

    # 同时输出到控制台和文件
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)


setup_logging()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 全局状态
project_state = ProjectState()
db = Database()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("Novel Agent 后端启动中...")
    db.initialize()
    logger.info("数据库初始化完成")
    yield
    db.close()
    logger.info("Novel Agent 后端已关闭")


app = FastAPI(title="Novel Agent", version="0.1.0", lifespan=lifespan)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# 基础端点
# ============================================================

@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/project")
async def get_project_info():
    """获取当前项目信息"""
    return {
        "root": project_state.root_path,
        "file_count": len(project_state.file_index),
        "indexed": project_state.is_indexed,
    }


@app.post("/api/project/open")
async def open_project(path: str):
    """打开项目目录"""
    await project_state.scan_directory(path)
    return {"status": "ok", "file_count": len(project_state.file_index)}


# ============================================================
# 注册各模块路由
# ============================================================

register_llm_routes(app)
register_chat_routes(app)
register_rag_routes(app)
register_debug_routes(app)
register_ws_routes(app, project_state)


# ============================================================
# 启动
# ============================================================

if __name__ == "__main__":
    import argparse
    import uvicorn

    # 命令行参数（sidecar 模式由 Tauri 注入；dev 模式无参走默认）
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=settings.host, help="绑定地址")
    parser.add_argument("--port", type=int, default=settings.port, help="绑定端口")
    args = parser.parse_args()

    # reload=False: 进程生命周期由 Tauri PythonBridge 管理，不需要 uvicorn 自己监控文件变化
    # 直接传 app 对象而非字符串，避免 Windows 下 multiprocessing spawn 产生多余进程
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        reload=False,
    )
