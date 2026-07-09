"""
Claude 客户端
"""

import json
import logging
from typing import Optional

from llm.adapter import LLMAdapter, LLMMessage
from config import settings

logger = logging.getLogger(__name__)


class ClaudeClient(LLMAdapter):
    """Claude API 客户端"""

    def __init__(self, api_key: str = "", model: str = "", **kwargs):
        self.api_key = api_key or settings.llm_api_key
        self.model = model or "claude-sonnet-4-20250514"
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                import anthropic
                self._client = anthropic.AsyncAnthropic(api_key=self.api_key)
            except ImportError:
                logger.error("anthropic 包未安装，请运行: pip install anthropic")
                raise
        return self._client

    async def chat(self, messages: list[LLMMessage], **kwargs) -> str:
        client = self._get_client()

        # 分离 system 和 user/assistant 消息
        system_msg = ""
        chat_messages = []
        for m in messages:
            if m.role == "system":
                system_msg = m.content
            else:
                chat_messages.append(m.to_dict())

        response = await client.messages.create(
            model=self.model,
            system=system_msg,
            messages=chat_messages,
            max_tokens=kwargs.get("max_tokens", 4096),
        )
        return response.content[0].text

    async def chat_json(self, messages: list[LLMMessage], **kwargs) -> dict:
        result = await self.chat(messages, **kwargs)
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            logger.error(f"Claude 返回非 JSON 内容: {result[:200]}")
            return {"error": "invalid_json", "raw": result}

    def is_available(self) -> bool:
        return bool(self.api_key)
