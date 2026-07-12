"""
路由模块
统一导出各路由注册函数
"""

from routes.llm import register_llm_routes
from routes.chat import register_chat_routes
from routes.rag import register_rag_routes
from routes.ws import register_ws_routes

__all__ = [
    "register_llm_routes",
    "register_chat_routes",
    "register_rag_routes",
    "register_ws_routes",
]
