"""
OpenAI / 兼容 API 客户端
"""

import json
import logging
from typing import Optional

from llm.adapter import LLMAdapter, LLMMessage
from config import settings

logger = logging.getLogger(__name__)


class OpenAIClient(LLMAdapter):
    """OpenAI API 客户端"""

    def __init__(self, api_key: str = "", model: str = "", base_url: str = "", **kwargs):
        self.api_key = api_key or settings.llm_api_key
        self.model = model or settings.llm_model
        self.base_url = base_url or settings.llm_base_url or "https://api.openai.com/v1"
        self._client = None

    def _get_client(self):
        """延迟初始化客户端"""
        if self._client is None:
            try:
                import openai
                self._client = openai.AsyncOpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url,
                )
            except ImportError:
                logger.error("openai 包未安装，请运行: pip install openai")
                raise
        return self._client

    async def chat(self, messages: list[LLMMessage], **kwargs) -> str:
        client = self._get_client()
        response = await client.chat.completions.create(
            model=self.model,
            messages=[m.to_dict() for m in messages],
            **kwargs,
        )
        return response.choices[0].message.content

    async def chat_json(self, messages: list[LLMMessage], **kwargs) -> dict:
        result = await self.chat(messages, response_format={"type": "json_object"}, **kwargs)
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            logger.error(f"LLM 返回非 JSON 内容: {result[:200]}")
            return {"error": "invalid_json", "raw": result}

    def is_available(self) -> bool:
        return bool(self.api_key)
