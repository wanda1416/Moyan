"""
Novel Agent - AI 小说协作后端
服务入口：FastAPI + WebSocket
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from core.state import ProjectState
from agents import get_dispatcher
from memory.db import Database

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


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 端点 - Agent 通信"""
    await websocket.accept()
    dispatcher = get_dispatcher()

    try:
        while True:
            data = await websocket.receive_text()
            request = json.loads(data)

            agent_type = request.get("agent_type")
            action = request.get("action")

            logger.info(f"收到请求: agent={agent_type}, action={action}")

            # 调度到对应 Agent
            result = await dispatcher.dispatch(
                agent_type=agent_type,
                action=action,
                payload=request,
                project_state=project_state,
            )

            await websocket.send_json(result)

    except WebSocketDisconnect:
        logger.info("WebSocket 连接已断开")
    except Exception as e:
        logger.error(f"WebSocket 错误: {e}")
        await websocket.close(code=1011, reason=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
