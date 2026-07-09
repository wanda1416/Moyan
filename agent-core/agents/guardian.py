"""
守夜人 (Guardian)
保存时校验一致性，LLM 驱动的一致性检查
"""

import json
import logging
import re
from pathlib import Path
from agents.base import BaseAgent
from llm.adapter import LLMAdapter, LLMMessage
from config import settings

logger = logging.getLogger(__name__)


class Guardian(BaseAgent):
    name = "guardian"
    description = "守夜人 - 校验一致性 (人物/设定/时间线/伏笔)"

    def __init__(self):
        super().__init__()
        self._llm: LLMAdapter | None = None

    def _get_llm(self) -> LLMAdapter:
        if self._llm is None:
            from llm.adapter import create_adapter
            self._llm = create_adapter(settings.llm_provider)
        return self._llm

    async def execute(self, action: str, payload: dict, context: dict) -> dict:
        if action == "validate":
            return await self._validate(payload, context)
        elif action == "check_character":
            return await self._check_character(payload, context)
        elif action == "query":
            return await self._handle_query(payload, context)
        else:
            return self.build_response(f"不支持的动作: {action}", success=False)

    async def _validate(self, payload: dict, context: dict) -> dict:
        """校验章节一致性：读取章节+设定 → LLM 检查 → 返回警告列表"""
        file_path = payload.get("file_path", "")
        project_state = context.get("project_state")

        if not file_path:
            return self.build_response("请提供文件路径", success=False)

        # 1. 收集上下文
        chapter_content = self._read_file(file_path)
        if not chapter_content:
            return self.build_response(f"无法读取文件: {file_path}", success=False)

        setting_context = ""
        if project_state and project_state.is_indexed:
            from core.retriever import Retriever
            retriever = Retriever(project_state)
            related = retriever.get_related_files(file_path)

            setting_parts = []
            for ref in related:
                ref_path = ref.get("path", "")
                if ref_path:
                    content = self._read_file(ref_path)
                    if content:
                        label = ref.get("label", Path(ref_path).stem)
                        setting_parts.append(f"【{label}】\n{content[:1500]}")

            setting_context = "\n\n---\n\n".join(setting_parts)

        # 2. 构造校验 prompt
        messages = [
            LLMMessage("system", self.system_prompt or "你是守夜人，严格校验一致性。"),
        ]

        if setting_context:
            messages.append(LLMMessage("user", f"以下是设定文件：\n\n{setting_context}"))

        messages.append(LLMMessage("user",
            f"请检查以下章节内容的一致性问题：\n\n{chapter_content[:5000]}\n\n"
            f"请以 JSON 格式返回警告列表。"))

        # 3. 调用 LLM
        try:
            llm = self._get_llm()
            if not llm.is_available():
                return self.build_response(
                    f"LLM 服务不可用（provider: {settings.llm_provider}）", success=False)

            answer = await llm.chat(messages)
            warnings = self._parse_warnings(answer)

            # 4. 记录到校验日志
            if project_state and warnings:
                self._log_warnings(file_path, warnings)

            return self.build_response(
                content=answer,
                structured_data={"warnings": warnings, "count": len(warnings)},
            )

        except Exception as e:
            logger.error(f"Guardian 校验失败: {e}")
            return self.build_response(f"校验失败: {str(e)}", success=False)

    async def _check_character(self, payload: dict, context: dict) -> dict:
        """检查人物状态一致性"""
        character_name = payload.get("character_name", "")
        file_path = payload.get("file_path", "")
        project_state = context.get("project_state")

        if not character_name:
            return self.build_response("请提供人物名称", success=False)

        # 收集人物相关设定
        character_info = ""
        if project_state and project_state.is_indexed:
            for path, info in project_state.file_index.items():
                if info.get("type") == "setting" and character_name in Path(path).stem:
                    content = self._read_file(path)
                    if content:
                        character_info += f"\n【{Path(path).stem}】\n{content[:2000]}"

        # 读取当前章节
        chapter_content = ""
        if file_path:
            chapter_content = self._read_file(file_path)[:3000]

        messages = [
            LLMMessage("system", self.system_prompt or "你是守夜人，检查人物一致性。"),
            LLMMessage("user",
                f"人物名称: {character_name}\n\n"
                f"人物设定:\n{character_info or '未找到相关设定文件'}\n\n"
                f"当前章节内容:\n{chapter_content or '无'}\n\n"
                f"请检查该人物在本章中的状态是否与设定一致。"),
        ]

        try:
            llm = self._get_llm()
            if not llm.is_available():
                return self.build_response("LLM 服务不可用", success=False)
            answer = await llm.chat(messages)
            return self.build_response(content=answer)
        except Exception as e:
            logger.error(f"Guardian 人物检查失败: {e}")
            return self.build_response(f"检查失败: {str(e)}", success=False)

    async def _handle_query(self, payload: dict, context: dict) -> dict:
        """处理通用查询"""
        question = payload.get("question", "")
        file_path = payload.get("file_path", "")
        project_state = context.get("project_state")

        if not question:
            return self.build_response("请输入问题", success=False)

        messages = [
            LLMMessage("system", self.system_prompt or "你是守夜人，负责一致性校验。"),
        ]

        # 附加章节上下文
        if file_path:
            chapter = self._read_file(file_path)[:3000]
            if chapter:
                messages.append(LLMMessage("user", f"当前章节内容：\n{chapter}"))

        messages.append(LLMMessage("user", question))

        try:
            llm = self._get_llm()
            if not llm.is_available():
                return self.build_response("LLM 服务不可用", success=False)
            answer = await llm.chat(messages)
            return self.build_response(content=answer)
        except Exception as e:
            return self.build_response(f"查询失败: {str(e)}", success=False)

    def _parse_warnings(self, text: str) -> list[dict]:
        """从 LLM 回复中解析警告列表"""
        # 尝试直接解析 JSON
        try:
            data = json.loads(text)
            if "warnings" in data:
                return data["warnings"]
        except json.JSONDecodeError:
            pass

        # 尝试从 markdown 代码块提取
        json_match = re.search(r'```(?:json)?\s*\n(.*?)\n```', text, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group(1))
                if "warnings" in data:
                    return data["warnings"]
            except json.JSONDecodeError:
                pass

        return []

    def _log_warnings(self, file_path: str, warnings: list[dict]):
        """记录警告到校验日志"""
        try:
            from memory.db import Database
            db = Database()
            db.initialize()
            for w in warnings:
                db.execute(
                    "INSERT INTO continuity_log (chapter_id, warning_type, severity, message, file_path) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (file_path, w.get("type", "unknown"), w.get("severity", "warning"),
                     w.get("message", ""), w.get("file", "")),
                )
            db.conn.commit()
            db.close()
        except Exception as e:
            logger.warning(f"记录校验日志失败: {e}")

    def _read_file(self, file_path: str) -> str:
        try:
            path = Path(file_path)
            if path.exists():
                return path.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning(f"读取文件失败 {file_path}: {e}")
        return ""
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
