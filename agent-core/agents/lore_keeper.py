"""
设定顾问 (LoreKeeper)
回答设定相关问题，检索关联文件
"""

import logging
from agents.base import BaseAgent

logger = logging.getLogger(__name__)


class LoreKeeper(BaseAgent):
    name = "lore_keeper"
    description = "设定顾问 - 回答设定相关问题，检索关联文件"

    async def execute(self, action: str, payload: dict, context: dict) -> dict:
        if action == "query":
            return await self._handle_query(payload, context)
        elif action == "get_references":
            return await self._handle_references(payload, context)
        else:
            return self.build_response(f"不支持的动作: {action}", success=False)

    async def _handle_query(self, payload: dict, context: dict) -> dict:
        """处理设定查询"""
        question = payload.get("question", "")
        project_state = context.get("project_state")

        # TODO: 调用 LLM 回答设定问题
        # 1. 检索相关设定文件
        # 2. 构造 prompt
        # 3. 调用 LLM
        # 4. 返回回答 + 引用文件

        return self.build_response(
            content=f"[设定顾问] 收到问题: {question}\n\nTODO: 接入 LLM 后返回设定回答",
            references=[],
        )

    async def _handle_references(self, payload: dict, context: dict) -> dict:
        """获取关联设定文件列表"""
        file_path = payload.get("file_path", "")
        project_state = context.get("project_state")

        if not project_state:
            return self.build_response("项目状态不可用", success=False)

        from core.retriever import Retriever
        retriever = Retriever(project_state)
        related = retriever.get_related_files(file_path)

        return self.build_response(
            content=f"找到 {len(related)} 个关联文件",
            references=[r["path"] for r in related],
            structured_data={"related_files": related},
        )
