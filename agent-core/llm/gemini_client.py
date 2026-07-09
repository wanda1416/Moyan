"""
Google Gemini 原生 API 客户端
使用 google-genai 包 (新版 SDK)
"""

import os
import json
import logging
from typing import Optional

from llm.adapter import LLMAdapter, LLMMessage
from config import settings

logger = logging.getLogger(__name__)


class GeminiClient(LLMAdapter):
    """Google Gemini API 客户端"""

    def __init__(self, api_key: str = "", model: str = "", base_url: str = "", proxy: str = "", **kwargs):
        self.api_key = api_key or settings.llm_api_key
        self.model = model or settings.llm_model or "gemini-2.0-flash"
        self.proxy = proxy or settings.llm_proxy
        self._client = None

        # 设置代理环境变量
        if self.proxy:
            os.environ["HTTP_PROXY"] = self.proxy
            os.environ["HTTPS_PROXY"] = self.proxy
            logger.info(f"Gemini 使用代理: {self.proxy}")

    def _get_client(self):
        """延迟初始化客户端"""
        if self._client is None:
            try:
                from google import genai
                self._client = genai.Client(api_key=self.api_key)
            except ImportError:
                logger.error("google-genai 包未安装，请运行: pip install google-genai")
                raise
        return self._client

    def _convert_messages(self, messages: list[LLMMessage]) -> tuple[list, Optional[str]]:
        """将统一消息格式转换为 Gemini 格式"""
        from google.genai import types
        
        contents = []
        system_instruction = None

        for msg in messages:
            if msg.role == "system":
                # Gemini 的 system instruction 单独处理
                system_instruction = msg.content
            elif msg.role == "user":
                contents.append(types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=msg.content)]
                ))
            elif msg.role == "assistant":
                contents.append(types.Content(
                    role="model",
                    parts=[types.Part.from_text(text=msg.content)]
                ))

        return contents, system_instruction

    async def chat(self, messages: list[LLMMessage], **kwargs) -> str:
        from google.genai import types

        client = self._get_client()
        contents, system_instruction = self._convert_messages(messages)

        # Gemini 需要交替 user/model 消息，最后一条必须是 user
        # 如果最后一条是 assistant，需要调整
        if contents and contents[-1].role == "model":
            contents.pop()

        if not contents:
            return ""

        # 配置生成参数
        config = types.GenerateContentConfig(
            temperature=kwargs.get("temperature", 0.7),
            system_instruction=system_instruction,
        )

        # 调用 API (异步)
        response = await client.aio.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )
        return response.text

    async def chat_json(self, messages: list[LLMMessage], **kwargs) -> dict:
        # Gemini 没有原生 JSON 模式，在 prompt 里要求 JSON
        messages = list(messages)
        messages.append(LLMMessage("user", "请以 JSON 格式返回结果。"))

        result = await self.chat(messages, **kwargs)
        try:
            # 尝试提取 JSON 部分
            if "```json" in result:
                result = result.split("```json")[1].split("```")[0]
            elif "```" in result:
                result = result.split("```")[1].split("```")[0]
            return json.loads(result.strip())
        except (json.JSONDecodeError, IndexError):
            logger.error(f"LLM 返回非 JSON 内容: {result[:200]}")
            return {"error": "invalid_json", "raw": result}

    def is_available(self) -> bool:
        return bool(self.api_key)
