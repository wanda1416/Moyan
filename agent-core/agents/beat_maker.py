"""
节拍师 (BeatMaker)
根据大纲生成本章节拍结构
"""

import json
import logging
from pathlib import Path
from agents.base import BaseAgent
from llm.adapter import LLMAdapter, LLMMessage
from config import settings

logger = logging.getLogger(__name__)


class BeatMaker(BaseAgent):
    name = "beat_maker"
    description = "节拍师 - 根据大纲生成章节结构"

    def __init__(self):
        super().__init__()
        self._llm: LLMAdapter | None = None

    def _get_llm(self) -> LLMAdapter:
        if self._llm is None:
            from llm.adapter import create_adapter
            self._llm = create_adapter(settings.llm_provider)
        return self._llm

    async def execute(self, action: str, payload: dict, context: dict) -> dict:
        if action == "generate_beats":
            return await self._generate_beats(payload, context)
        elif action == "query":
            return await self._handle_query(payload, context)
        else:
            return self.build_response(f"不支持的动作: {action}", success=False)

    async def _generate_beats(self, payload: dict, context: dict) -> dict:
        """生成章节节拍：读取大纲+章节内容 → 构造 prompt → 调用 LLM → 返回结构化节拍"""
        file_path = payload.get("file_path", "")
        question = payload.get("question", "")
        project_state = context.get("project_state")

        # 1. 收集上下文
        outline_content = ""
        chapter_content = ""
        prev_next_context = ""

        if project_state and project_state.is_indexed:
            from core.retriever import Retriever
            retriever = Retriever(project_state)

            # 读取当前章节内容
            if file_path:
                chapter_content = self._read_file(file_path)
                related = retriever.get_related_files(file_path)

                # 读取大纲
                for ref in related:
                    if ref.get("type") == "outline":
                        outline_content = self._read_file(ref["path"])
                    elif ref.get("type") in ("prev_chapter", "next_chapter"):
                        content = self._read_file(ref["path"])
                        if content:
                            label = "前一章" if ref["type"] == "prev_chapter" else "后一章"
                            prev_next_context += f"\n【{label}摘要】\n{content[:500]}"

        # 2. 构造 prompt
        messages = [
            LLMMessage("system", self.system_prompt or "你是节拍师，为章节生成节拍结构。"),
        ]

        context_parts = []
        if outline_content:
            context_parts.append(f"【卷大纲】\n{outline_content[:2000]}")
        if chapter_content:
            context_parts.append(f"【当前章节内容】\n{chapter_content[:1500]}")
        if prev_next_context:
            context_parts.append(prev_next_context.strip())

        if context_parts:
            messages.append(LLMMessage("user", "以下是相关上下文：\n\n" + "\n\n---\n\n".join(context_parts)))

        user_question = question or "请为当前章节生成节拍结构"
        messages.append(LLMMessage("user", f"{user_question}\n\n请以 JSON 格式返回节拍结构。"))

        # 3. 调用 LLM
        try:
            llm = self._get_llm()
            if not llm.is_available():
                return self.build_response(
                    f"LLM 服务不可用。请检查配置（provider: {settings.llm_provider}）。",
                    success=False,
                )

            answer = await llm.chat(messages)

            # 尝试解析 JSON 节拍
            beats = self._parse_beats(answer)
            return self.build_response(
                content=answer,
                structured_data={"beats": beats} if beats else {},
            )

        except Exception as e:
            logger.error(f"BeatMaker LLM 调用失败: {e}")
            return self.build_response(f"生成节拍失败: {str(e)}", success=False)

    async def _handle_query(self, payload: dict, context: dict) -> dict:
        """处理通用查询（对话模式）"""
        question = payload.get("question", "")
        file_path = payload.get("file_path", "")
        project_state = context.get("project_state")

        if not question:
            return self.build_response("请输入问题", success=False)

        messages = [
            LLMMessage("system", self.system_prompt or "你是节拍师，帮助规划章节结构。"),
        ]

        # 读取当前章节和大纲作为上下文
        if project_state and project_state.is_indexed and file_path:
            from core.retriever import Retriever
            retriever = Retriever(project_state)
            related = retriever.get_related_files(file_path)

            context_parts = []
            chapter_content = self._read_file(file_path)
            if chapter_content:
                context_parts.append(f"【当前章节】\n{chapter_content[:1500]}")

            for ref in related:
                if ref.get("type") == "outline":
                    outline = self._read_file(ref["path"])
                    if outline:
                        context_parts.append(f"【大纲】\n{outline[:1500]}")

            if context_parts:
                messages.append(LLMMessage("user", "以下是相关上下文：\n\n" + "\n\n---\n\n".join(context_parts)))

        messages.append(LLMMessage("user", question))

        try:
            llm = self._get_llm()
            if not llm.is_available():
                return self.build_response(f"LLM 服务不可用（provider: {settings.llm_provider}）", success=False)
            answer = await llm.chat(messages)
            return self.build_response(content=answer)
        except Exception as e:
            logger.error(f"BeatMaker 查询失败: {e}")
            return self.build_response(f"查询失败: {str(e)}", success=False)

    def _parse_beats(self, text: str) -> list | None:
        """尝试从 LLM 回复中解析节拍 JSON"""
        # 尝试直接解析
        try:
            data = json.loads(text)
            if "beats" in data:
                return data["beats"]
        except json.JSONDecodeError:
            pass

        # 尝试从 markdown 代码块中提取
        import re
        json_match = re.search(r'```(?:json)?\s*\n(.*?)\n```', text, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group(1))
                if "beats" in data:
                    return data["beats"]
            except json.JSONDecodeError:
                pass

        return None

    def _read_file(self, file_path: str) -> str:
        try:
            path = Path(file_path)
            if path.exists():
                return path.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning(f"读取文件失败 {file_path}: {e}")
        return ""
"""
节拍师 (BeatMaker)
根据大纲生成本章结构
"""

import logging
from agents.base import BaseAgent

logger = logging.getLogger(__name__)


class BeatMaker(BaseAgent):
    name = "beat_maker"
    description = "节拍师 - 根据大纲生成章节结构"

    async def execute(self, action: str, payload: dict, context: dict) -> dict:
        if action == "generate_beats":
            return await self._generate_beats(payload, context)
        else:
            return self.build_response(f"不支持的动作: {action}", success=False)

    async def _generate_beats(self, payload: dict, context: dict) -> dict:
        """生成章节节拍"""
        chapter = payload.get("chapter", "")
        project_state = context.get("project_state")

        # TODO: 调用 LLM 生成节拍
        # 1. 读取当前章节内容 + 关联设定
        # 2. 读取大纲中本章定位
        # 3. 构造 Prompt → 调用 LLM
        # 4. 返回结构化节拍 (JSON)

        return self.build_response(
            content=f"[节拍师] 为章节 {chapter} 生成节拍\n\nTODO: 接入 LLM 后返回节拍结构",
            structured_data={
                "beats": [
                    {"id": 1, "title": "开场", "description": "TODO"},
                    {"id": 2, "title": "发展", "description": "TODO"},
                    {"id": 3, "title": "高潮", "description": "TODO"},
                    {"id": 4, "title": "收尾", "description": "TODO"},
                ]
            },
        )
