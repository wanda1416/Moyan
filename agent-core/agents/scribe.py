"""
写手 (Scribe)
按节拍或用户指令生成段落
"""

import logging
from agents.base import BaseAgent

logger = logging.getLogger(__name__)


class Scribe(BaseAgent):
    name = "scribe"
    description = "写手 - 按节拍或用户指令生成段落"

    async def execute(self, action: str, payload: dict, context: dict) -> dict:
        if action == "generate_paragraph":
            return await self._generate_paragraph(payload, context)
        elif action == "expand":
            return await self._expand_content(payload, context)
        else:
            return self.build_response(f"不支持的动作: {action}", success=False)

    async def _generate_paragraph(self, payload: dict, context: dict) -> dict:
        """按指令生成段落"""
        instruction = payload.get("instruction", "")
        beat = payload.get("beat", {})

        # TODO: 调用 LLM 生成段落
        return self.build_response(
            content=f"[写手] 收到指令: {instruction}\n\nTODO: 接入 LLM 后生成段落",
        )

    async def _expand_content(self, payload: dict, context: dict) -> dict:
        """扩写内容"""
        content = payload.get("content", "")

        # TODO: 调用 LLM 扩写
        return self.build_response(
            content=f"[写手] 扩写请求已收到\n\nTODO: 接入 LLM 后扩写内容",
        )
