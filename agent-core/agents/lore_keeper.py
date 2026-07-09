"""
设定顾问 (LoreKeeper)
回答设定相关问题，检索关联文件，标注引用来源
"""

import logging
from pathlib import Path
from agents.base import BaseAgent
from llm.adapter import LLMAdapter, LLMMessage
from config import settings

logger = logging.getLogger(__name__)


class LoreKeeper(BaseAgent):
    name = "lore_keeper"
    description = "设定顾问 - 回答设定相关问题，检索关联文件"

    def __init__(self):
        super().__init__()
        self._llm: LLMAdapter | None = None

    def _get_llm(self) -> LLMAdapter:
        """获取 LLM 实例（延迟初始化）"""
        if self._llm is None:
            from llm.adapter import create_adapter
            self._llm = create_adapter(settings.llm_provider)
        return self._llm

    async def execute(self, action: str, payload: dict, context: dict) -> dict:
        if action == "query":
            return await self._handle_query(payload, context)
        elif action == "get_references":
            return await self._handle_references(payload, context)
        else:
            return self.build_response(f"不支持的动作: {action}", success=False)

    async def _handle_query(self, payload: dict, context: dict) -> dict:
        """处理设定查询：检索 → 构造 prompt → 调用 LLM → 返回带引用的回答"""
        question = payload.get("question", "")
        project_state = context.get("project_state")
        file_path = payload.get("file_path")

        if not question:
            return self.build_response("请输入问题", success=False)

        # 1. 检索相关设定文件
        references = []
        context_text = ""

        if project_state and project_state.is_indexed:
            from core.retriever import Retriever
            retriever = Retriever(project_state)

            # 获取关联文件
            if file_path:
                related = retriever.get_related_files(file_path)
            else:
                # 没有当前文件时，搜索所有设定文件
                related = []
                for path, info in project_state.file_index.items():
                    if info.get("type") == "setting":
                        related.append({"type": "setting", "path": path, "label": Path(path).stem})
                related = related[:10]

            # 读取设定文件内容作为上下文
            context_parts = []
            for ref in related:
                ref_path = ref.get("path", "")
                if ref_path:
                    content = self._read_file(ref_path)
                    if content:
                        context_parts.append(f"【{ref.get('label', Path(ref_path).stem)}】\n{content[:2000]}")
                        references.append(ref_path)

            context_text = "\n\n---\n\n".join(context_parts) if context_parts else ""

        # 2. 构造 prompt
        messages = [
            LLMMessage("system", self.system_prompt or "你是设定顾问，回答小说设定问题。"),
        ]

        if context_text:
            messages.append(LLMMessage("user", f"以下是相关设定文件内容：\n\n{context_text}"))

        messages.append(LLMMessage("user", f"问题：{question}"))

        # 3. 调用 LLM
        try:
            llm = self._get_llm()
            if not llm.is_available():
                return self.build_response(
                    f"LLM 服务不可用。请检查配置（provider: {settings.llm_provider}）。\n\n"
                    f"你的问题：{question}\n\n"
                    f"已检索到 {len(references)} 个相关文件：\n" +
                    "\n".join(f"  - {r}" for r in references),
                    references=references,
                )

            answer = await llm.chat(messages)

            return self.build_response(
                content=answer,
                references=references,
            )

        except Exception as e:
            logger.error(f"LLM 调用失败: {e}")
            return self.build_response(
                f"LLM 调用失败: {str(e)}\n\n"
                f"你的问题：{question}\n\n"
                f"已检索到 {len(references)} 个相关文件：\n" +
                "\n".join(f"  - {r}" for r in references),
                references=references,
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

    def _read_file(self, file_path: str) -> str:
        """读取文件内容"""
        try:
            path = Path(file_path)
            if path.exists():
                return path.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning(f"读取文件失败 {file_path}: {e}")
        return ""
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
