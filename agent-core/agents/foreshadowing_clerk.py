"""
伏笔官 (ForeshadowingClerk)
跟踪伏笔埋设与兑现，支持 LLM 辅助识别
"""

import logging
from agents.base import BaseAgent
from llm.adapter import LLMAdapter, LLMMessage
from config import settings
from memory.db import Database
from memory.foreshadowing import ForeshadowingLedger

logger = logging.getLogger(__name__)


class ForeshadowingClerk(BaseAgent):
    name = "foreshadowing_clerk"
    description = "伏笔官 - 跟踪伏笔埋设与兑现"

    def __init__(self):
        super().__init__()
        self._llm: LLMAdapter | None = None
        self._ledger: ForeshadowingLedger | None = None

    def _get_llm(self) -> LLMAdapter:
        if self._llm is None:
            from llm.adapter import create_adapter
            self._llm = create_adapter(settings.llm_provider)
        return self._llm

    def _get_ledger(self) -> ForeshadowingLedger:
        """获取伏笔账本（延迟初始化）"""
        if self._ledger is None:
            db = Database()
            db.initialize()
            self._ledger = ForeshadowingLedger(db)
        return self._ledger

    def _next_fw_id(self) -> str:
        """生成下一个伏笔 ID"""
        ledger = self._get_ledger()
        pending = ledger.get_pending()
        # 简单递增：取当前最大编号 +1
        max_num = 0
        for fw in pending:
            fw_id = fw.get("id", "")
            if fw_id.startswith("fw_"):
                try:
                    num = int(fw_id[3:])
                    max_num = max(max_num, num)
                except ValueError:
                    pass
        return f"fw_{max_num + 1:03d}"

    async def execute(self, action: str, payload: dict, context: dict) -> dict:
        if action == "plant":
            return await self._plant_foreshadowing(payload, context)
        elif action == "resolve":
            return await self._resolve_foreshadowing(payload, context)
        elif action == "check":
            return await self._check_foreshadowing(payload, context)
        elif action == "list_pending":
            return await self._list_pending(payload, context)
        elif action == "query":
            return await self._handle_query(payload, context)
        else:
            return self.build_response(f"不支持的动作: {action}", success=False)

    async def _plant_foreshadowing(self, payload: dict, context: dict) -> dict:
        """标记新伏笔"""
        description = payload.get("description", "")
        chapter = payload.get("chapter", payload.get("file_path", ""))

        if not description:
            return self.build_response("请提供伏笔描述", success=False)

        fw_id = self._next_fw_id()
        ledger = self._get_ledger()
        success = ledger.plant(fw_id, description, chapter)

        if success:
            return self.build_response(
                content=f"新伏笔已记录: {fw_id}\n描述: {description}\n埋设于: {chapter}",
                structured_data={
                    "foreshadowing_id": fw_id,
                    "description": description,
                    "planted_in": chapter,
                },
            )
        else:
            return self.build_response("伏笔记录失败", success=False)

    async def _resolve_foreshadowing(self, payload: dict, context: dict) -> dict:
        """兑现伏笔"""
        foreshadowing_id = payload.get("foreshadowing_id", "")
        chapter = payload.get("chapter", payload.get("file_path", ""))

        if not foreshadowing_id:
            return self.build_response("请提供伏笔 ID", success=False)

        ledger = self._get_ledger()
        fw = ledger.get_by_id(foreshadowing_id)

        if not fw:
            return self.build_response(f"未找到伏笔: {foreshadowing_id}", success=False)

        if fw.get("status") == "resolved":
            return self.build_response(
                f"伏笔 {foreshadowing_id} 已兑现于 {fw.get('resolved_in', '未知')}",
                success=False,
            )

        success = ledger.resolve(foreshadowing_id, chapter)
        if success:
            return self.build_response(
                content=f"伏笔 {foreshadowing_id} 已在 {chapter} 兑现\n原始描述: {fw.get('description', '')}",
            )
        else:
            return self.build_response("兑现失败", success=False)

    async def _check_foreshadowing(self, payload: dict, context: dict) -> dict:
        """检查章节相关伏笔"""
        chapter = payload.get("chapter", payload.get("file_path", ""))

        if not chapter:
            return self.build_response("请提供章节路径", success=False)

        ledger = self._get_ledger()
        related = ledger.get_by_chapter(chapter)

        pending = [fw for fw in related if fw.get("status") == "pending"]
        resolved = [fw for fw in related if fw.get("status") == "resolved"]

        content_parts = []
        if pending:
            content_parts.append(f"待兑现伏笔 ({len(pending)}):")
            for fw in pending:
                content_parts.append(f"  - {fw['id']}: {fw['description']} (埋设于 {fw['planted_in']})")

        if resolved:
            content_parts.append(f"\n已兑现伏笔 ({len(resolved)}):")
            for fw in resolved:
                content_parts.append(f"  - {fw['id']}: {fw['description']} (兑现于 {fw.get('resolved_in', '未知')})")

        if not content_parts:
            content_parts.append("本章暂无相关伏笔记录")

        return self.build_response(
            content="\n".join(content_parts),
            structured_data={"pending": pending, "resolved": resolved},
        )

    async def _list_pending(self, payload: dict, context: dict) -> dict:
        """列出所有待兑现伏笔"""
        ledger = self._get_ledger()
        pending = ledger.get_pending()

        if not pending:
            return self.build_response(
                "暂无待兑现伏笔",
                structured_data={"pending": []},
            )

        content_parts = [f"待兑现伏笔 ({len(pending)}):"]
        for fw in pending:
            content_parts.append(
                f"  - {fw['id']}: {fw['description']}\n"
                f"    埋设于: {fw['planted_in']} | 创建时间: {fw.get('created_at', '未知')}"
            )

        return self.build_response(
            content="\n".join(content_parts),
            structured_data={"pending": pending},
        )

    async def _handle_query(self, payload: dict, context: dict) -> dict:
        """处理通用查询（LLM 辅助）"""
        question = payload.get("question", "")

        if not question:
            return self.build_response("请输入问题", success=False)

        # 获取当前伏笔状态作为上下文
        ledger = self._get_ledger()
        pending = ledger.get_pending()
        fw_context = ""
        if pending:
            fw_context = "当前待兑现伏笔:\n" + "\n".join(
                f"  - {fw['id']}: {fw['description']} (埋设于 {fw['planted_in']})"
                for fw in pending
            )

        messages = [
            LLMMessage("system", self.system_prompt or "你是伏笔官，管理小说伏笔。"),
        ]

        if fw_context:
            messages.append(LLMMessage("user", fw_context))

        messages.append(LLMMessage("user", question))

        try:
            llm = self._get_llm()
            if not llm.is_available():
                return self.build_response("LLM 服务不可用", success=False)
            answer = await llm.chat(messages)
            return self.build_response(content=answer)
        except Exception as e:
            return self.build_response(f"查询失败: {str(e)}", success=False)
"""
伏笔官 (ForeshadowingClerk)
跟踪伏笔埋设与兑现
"""

import logging
from agents.base import BaseAgent

logger = logging.getLogger(__name__)


class ForeshadowingClerk(BaseAgent):
    name = "foreshadowing_clerk"
    description = "伏笔官 - 跟踪伏笔埋设与兑现"

    async def execute(self, action: str, payload: dict, context: dict) -> dict:
        if action == "plant":
            return await self._plant_foreshadowing(payload, context)
        elif action == "resolve":
            return await self._resolve_foreshadowing(payload, context)
        elif action == "check":
            return await self._check_foreshadowing(payload, context)
        elif action == "list_pending":
            return await self._list_pending(payload, context)
        else:
            return self.build_response(f"不支持的动作: {action}", success=False)

    async def _plant_foreshadowing(self, payload: dict, context: dict) -> dict:
        """标记新伏笔"""
        description = payload.get("description", "")
        chapter = payload.get("chapter", "")

        # TODO: 存入 SQLite 伏笔账本
        return self.build_response(
            content=f"[伏笔官] 新伏笔已记录: {description}\n埋设于: {chapter}",
            structured_data={"foreshadowing_id": "TODO"},
        )

    async def _resolve_foreshadowing(self, payload: dict, context: dict) -> dict:
        """兑现伏笔"""
        foreshadowing_id = payload.get("foreshadowing_id", "")
        chapter = payload.get("chapter", "")

        # TODO: 更新 SQLite 伏笔状态
        return self.build_response(
            content=f"[伏笔官] 伏笔 {foreshadowing_id} 已在 {chapter} 兑现",
        )

    async def _check_foreshadowing(self, payload: dict, context: dict) -> dict:
        """检查章节相关伏笔"""
        chapter = payload.get("chapter", "")

        # TODO: 查询本章相关伏笔
        return self.build_response(
            content=f"[伏笔官] 章节 {chapter} 伏笔检查\n\nTODO: 查询伏笔账本",
            structured_data={"pending": [], "resolved": []},
        )

    async def _list_pending(self, payload: dict, context: dict) -> dict:
        """列出所有待兑现伏笔"""
        # TODO: 查询所有待兑现伏笔
        return self.build_response(
            content="[伏笔官] 待兑现伏笔列表\n\nTODO: 查询伏笔账本",
            structured_data={"pending": []},
        )
