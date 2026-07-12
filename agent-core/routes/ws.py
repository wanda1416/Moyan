"""
WebSocket Agent 通信路由
/ws — Agent 调度、文件设置、心跳
"""

import json
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from agents import get_dispatcher
from core.state import ProjectState

logger = logging.getLogger(__name__)


def register_ws_routes(app: FastAPI, project_state: ProjectState):
    """注册 WebSocket 路由"""

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        """WebSocket 端点 - Agent 通信"""
        await websocket.accept()
        dispatcher = get_dispatcher()
        current_file: str | None = None

        logger.info("WebSocket 客户端已连接")

        try:
            while True:
                data = await websocket.receive_text()
                try:
                    request = json.loads(data)
                except json.JSONDecodeError:
                    await websocket.send_json({
                        "request_id": None,
                        "success": False,
                        "agent_type": None,
                        "content": "无效的 JSON 格式",
                        "error_type": "invalid_json",
                    })
                    continue

                request_id = request.get("request_id")
                agent_type = request.get("agent_type")
                action = request.get("action")

                logger.info(f"收到请求: id={request_id}, agent={agent_type}, action={action}")

                # 特殊动作：设置当前文件
                if action == "set_current_file":
                    current_file = request.get("file_path")
                    logger.info(f"当前文件已设置: {current_file}")
                    # 自动检索关联文件
                    related = []
                    if current_file and project_state.is_indexed:
                        from core.retriever import Retriever
                        retriever = Retriever(project_state)
                        related = retriever.get_related_files(current_file)
                    await websocket.send_json({
                        "request_id": request_id,
                        "success": True,
                        "agent_type": None,
                        "content": f"当前文件: {current_file}",
                        "references": [r["path"] for r in related],
                        "structured_data": {"related_files": related, "current_file": current_file},
                    })
                    continue

                # 特殊动作：ping
                if action == "ping":
                    await websocket.send_json({
                        "request_id": request_id,
                        "success": True,
                        "agent_type": None,
                        "content": "pong",
                    })
                    continue

                # 校验必要字段
                if not agent_type:
                    await websocket.send_json({
                        "request_id": request_id,
                        "success": False,
                        "agent_type": None,
                        "content": "缺少 agent_type 字段",
                        "error_type": "missing_field",
                    })
                    continue

                # 自动注入当前文件上下文
                payload = request.get("payload", {})
                if current_file and "file_path" not in payload:
                    payload["file_path"] = current_file

                # 调度到对应 Agent
                result = await dispatcher.dispatch(
                    agent_type=agent_type,
                    action=action,
                    payload=payload,
                    project_state=project_state,
                )
                result["request_id"] = request_id

                await websocket.send_json(result)

        except WebSocketDisconnect:
            logger.info("WebSocket 连接已断开")
        except Exception as e:
            logger.error(f"WebSocket 错误: {e}")
            try:
                await websocket.close(code=1011, reason=str(e))
            except Exception:
                pass
