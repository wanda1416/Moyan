"""
写手 (Scribe)
按节拍或用户指令生成段落，支持扩写/润色
"""

import logging
from pathlib import Path
from agents.base import BaseAgent
from llm.adapter import LLMAdapter, LLMMessage
from config import settings

logger = logging.getLogger(__name__)


class Scribe(BaseAgent):
    name = "scribe"
    description = "写手 - 按节拍或用户指令生成段落"

    def __init__(self):
        super().__init__()
        self._llm: LLMAdapter | None = None

    def _get_llm(self) -> LLMAdapter:
        if self._llm is None:
            from llm.adapter import create_adapter
            self._llm = create_adapter(settings.llm_provider)
        return self._llm

    async def execute(self, action: str, payload: dict, context: dict) -> dict:
        if action == "generate_paragraph":
            return await self._generate_paragraph(payload, context)
        elif action == "expand":
            return await self._expand_content(payload, context)
        elif action == "polish":
            return await self._polish_content(payload, context)
        elif action == "query":
            return await self._handle_query(payload, context)
        else:
            return self.build_response(f"不支持的动作: {action}", success=False)

    async def _generate_paragraph(self, payload: dict, context: dict) -> dict:
        """按指令生成段落"""
        instruction = payload.get("instruction", "")
        beat = payload.get("beat", {})
        file_path = payload.get("file_path", "")
        project_state = context.get("project_state")

        if not instruction and not beat:
            return self.build_response("请提供写作指令或节拍", success=False)

        # 构造写作上下文
        context_text = self._build_writing_context(file_path, project_state)

        messages = [
            LLMMessage("system", self.system_prompt or "你是写手，协助小说创作。"),
        ]

        if context_text:
            messages.append(LLMMessage("user", f"以下是写作上下文：\n\n{context_text}"))

        # 构造具体指令
        if beat:
            beat_desc = beat.get("description", "")
            beat_title = beat.get("title", "")
            messages.append(LLMMessage("user",
                f"请按照以下节拍生成段落：\n节拍标题：{beat_title}\n节拍描述：{beat_desc}\n\n补充指令：{instruction}"))
        else:
            messages.append(LLMMessage("user", f"写作指令：{instruction}"))

        try:
            llm = self._get_llm()
            if not llm.is_available():
                return self.build_response(
                    f"LLM 服务不可用（provider: {settings.llm_provider}）", success=False)
            answer = await llm.chat(messages)
            return self.build_response(content=answer)
        except Exception as e:
            logger.error(f"Scribe 生成失败: {e}")
            return self.build_response(f"生成失败: {str(e)}", success=False)

    async def _expand_content(self, payload: dict, context: dict) -> dict:
        """扩写内容"""
        content = payload.get("content", "")
        instruction = payload.get("instruction", "")
        file_path = payload.get("file_path", "")
        project_state = context.get("project_state")

        if not content:
            return self.build_response("请提供需要扩写的内容", success=False)

        context_text = self._build_writing_context(file_path, project_state)

        messages = [
            LLMMessage("system", self.system_prompt or "你是写手，协助小说创作。"),
        ]

        if context_text:
            messages.append(LLMMessage("user", f"写作上下文：\n\n{context_text}"))

        expand_instruction = instruction or "请在保持原有风格的基础上扩写，增加细节描写、心理活动和环境渲染。"
        messages.append(LLMMessage("user",
            f"请扩写以下内容：\n\n原文：\n{content}\n\n扩写要求：{expand_instruction}"))

        try:
            llm = self._get_llm()
            if not llm.is_available():
                return self.build_response("LLM 服务不可用", success=False)
            answer = await llm.chat(messages)
            return self.build_response(content=answer)
        except Exception as e:
            logger.error(f"Scribe 扩写失败: {e}")
            return self.build_response(f"扩写失败: {str(e)}", success=False)

    async def _polish_content(self, payload: dict, context: dict) -> dict:
        """润色内容"""
        content = payload.get("content", "")
        instruction = payload.get("instruction", "")

        if not content:
            return self.build_response("请提供需要润色的内容", success=False)

        messages = [
            LLMMessage("system", self.system_prompt or "你是写手，协助小说创作。"),
            LLMMessage("user",
                f"请润色以下内容，改善文笔但保持原有风格和情节不变：\n\n{content}\n\n"
                f"额外要求：{instruction or '保持原文风格，提升文学性'}"),
        ]

        try:
            llm = self._get_llm()
            if not llm.is_available():
                return self.build_response("LLM 服务不可用", success=False)
            answer = await llm.chat(messages)
            return self.build_response(content=answer)
        except Exception as e:
            logger.error(f"Scribe 润色失败: {e}")
            return self.build_response(f"润色失败: {str(e)}", success=False)

    async def _handle_query(self, payload: dict, context: dict) -> dict:
        """处理通用查询（对话模式）"""
        question = payload.get("question", "")
        file_path = payload.get("file_path", "")
        project_state = context.get("project_state")

        if not question:
            return self.build_response("请输入问题", success=False)

        messages = [
            LLMMessage("system", self.system_prompt or "你是写手，协助小说创作。"),
        ]

        context_text = self._build_writing_context(file_path, project_state)
        if context_text:
            messages.append(LLMMessage("user", f"写作上下文：\n\n{context_text}"))

        messages.append(LLMMessage("user", question))

        try:
            llm = self._get_llm()
            if not llm.is_available():
                return self.build_response("LLM 服务不可用", success=False)
            answer = await llm.chat(messages)
            return self.build_response(content=answer)
        except Exception as e:
            logger.error(f"Scribe 查询失败: {e}")
            return self.build_response(f"查询失败: {str(e)}", success=False)

    def _build_writing_context(self, file_path: str, project_state) -> str:
        """构建写作上下文（当前章节+大纲+设定）"""
        if not project_state or not project_state.is_indexed or not file_path:
            return ""

        from core.retriever import Retriever
        retriever = Retriever(project_state)
        related = retriever.get_related_files(file_path)

        context_parts = []

        # 当前章节内容
        chapter_content = self._read_file(file_path)
        if chapter_content:
            context_parts.append(f"【当前章节】\n{chapter_content[:2000]}")

        # 大纲 + 前后章 + 设定
        for ref in related:
            ref_path = ref.get("path", "")
            if ref_path:
                content = self._read_file(ref_path)
                if content:
                    label = ref.get("label", Path(ref_path).stem)
                    context_parts.append(f"【{label}】\n{content[:1000]}")

        return "\n\n---\n\n".join(context_parts)

    def _read_file(self, file_path: str) -> str:
        try:
            path = Path(file_path)
            if path.exists():
                return path.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning(f"读取文件失败 {file_path}: {e}")
        return ""
