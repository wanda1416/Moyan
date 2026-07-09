"""
本地 Ollama 客户端
"""

import json
import logging
from typing import Optional

from llm.adapter import LLMAdapter, LLMMessage
from config import settings

logger = logging.getLogger(__name__)


class OllamaClient(LLMAdapter):
    """Ollama 本地模型客户端"""

    def __init__(self, base_url: str = "", model: str = "", **kwargs):
        self.base_url = base_url or settings.ollama_base_url
        self.model = model or settings.ollama_model

    async def chat(self, messages: list[LLMMessage], **kwargs) -> str:
        import aiohttp

        url = f"{self.base_url}/api/chat"
        payload = {
            "model": self.model,
            "messages": [m.to_dict() for m in messages],
            "stream": False,
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                if resp.status != 200:
                    error = await resp.text()
                    raise RuntimeError(f"Ollama 请求失败: {error}")
                data = await resp.json()
                return data["message"]["content"]

    async def chat_json(self, messages: list[LLMMessage], **kwargs) -> dict:
        result = await self.chat(messages, **kwargs)
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            logger.error(f"Ollama 返回非 JSON 内容: {result[:200]}")
            return {"error": "invalid_json", "raw": result}

    def is_available(self) -> bool:
        """检查 Ollama 服务是否运行中（同步检查，使用 urllib）"""
        import urllib.request
        import urllib.error
        try:
            req = urllib.request.Request(f"{self.base_url}/api/tags", method="GET")
            req.add_header("User-Agent", "Moyan/0.1")
            with urllib.request.urlopen(req, timeout=3) as resp:
                return resp.status == 200
        except (urllib.error.URLError, OSError, Exception):
            return False
