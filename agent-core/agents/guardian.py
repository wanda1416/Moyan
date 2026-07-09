"""
守夜人 (Guardian)
保存时校验一致性
"""

import logging
from agents.base import BaseAgent

logger = logging.getLogger(__name__)


class Guardian(BaseAgent):
    name = "guardian"
    description = "守夜人 - 校验一致性 (人物/设定/时间线/伏笔)"

    async def execute(self, action: str, payload: dict, context: dict) -> dict:
        if action == "validate":
            return await self._validate(payload, context)
        elif action == "check_character":
            return await self._check_character(payload, context)
        else:
            return self.build_response(f"不支持的动作: {action}", success=False)

    async def _validate(self, payload: dict, context: dict) -> dict:
        """校验章节一致性"""
        file_path = payload.get("file_path", "")
        project_state = context.get("project_state")

        # TODO: 实现一致性校验
        # 1. 扫描本章内容
        # 2. 对比设定文件
        # 3. 检查人物境界/宗门规则/时间线/伏笔
        # 4. 返回警告列表

        warnings = []

        return self.build_response(
            content=f"[守夜人] 校验完成: {file_path}\n\n发现 {len(warnings)} 个警告",
            structured_data={"warnings": warnings},
        )

    async def _check_character(self, payload: dict, context: dict) -> dict:
        """检查人物状态"""
        character_name = payload.get("character_name", "")

        # TODO: 检查人物状态是否一致
        return self.build_response(
            content=f"[守夜人] 人物检查: {character_name}\n\nTODO: 实现人物状态校验",
        )
