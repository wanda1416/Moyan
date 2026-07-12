"""
对话路由
/api/chat — 支持文件上下文注入 + RAG 检索增强
"""

import logging
import time
from datetime import datetime

from fastapi import FastAPI, Request

from config import settings
from debug_store import chat_debug_store

logger = logging.getLogger(__name__)


def register_chat_routes(app: FastAPI):
    """注册对话路由"""

    @app.post("/api/chat")
    async def chat(request: Request):
        """对话接口 - 支持 RAG 检索增强"""
        try:
            body = await request.json()
            messages = body.get("messages", [])
            project_root = body.get("project_root", "")
            file_path = body.get("file_path", "")

            if not messages:
                return {"status": "error", "message": "缺少 messages 参数"}

            logger.info(f"收到对话请求，{len(messages)} 条消息" + (f"，当前文件: {file_path}" if file_path else ""))

            # 当前文件上下文注入
            file_context = ""
            if file_path and project_root:
                try:
                    from pathlib import Path
                    full_path = Path(file_path)
                    if full_path.exists() and full_path.is_file():
                        content = full_path.read_text(encoding="utf-8", errors="ignore")
                        # 截断过长文件（最多 8000 字符）
                        if len(content) > 8000:
                            content = content[:8000] + "\n... (内容已截断)"
                        file_name = full_path.name
                        file_context = f"用户当前正在编辑文件: {file_name}\n以下是该文件的内容，请在回答时参考：\n\n```\n{content}\n```"
                        logger.info(f"已注入当前文件上下文: {file_name} ({len(content)} 字符)")
                except Exception as e:
                    logger.warning(f"读取当前文件失败（不影响对话）: {e}")

            # RAG 检索增强：如果项目索引存在，自动检索相关上下文
            rag_context = ""
            good_results = []
            if project_root:
                try:
                    from rag.index import get_project_index
                    pindex = get_project_index()
                    status = pindex.get_index_status(project_root)
                    if status["indexed"]:
                        # 取用户最后一条消息作为查询
                        last_user_msg = ""
                        for m in reversed(messages):
                            if m.get("role") == "user":
                                last_user_msg = m.get("content", "")
                                break

                        if last_user_msg:
                            results = pindex.search(project_root, last_user_msg, top_k=3)
                            # 过滤低分结果（阈值 0.5）
                            good_results = [r for r in results if r["score"] > 0.5]
                            if good_results:
                                context_parts = ["以下是从项目文档中检索到的相关内容，请在回答时参考："]
                                for r in good_results:
                                    source = r["source_path"].split("\\")[-1].split("/")[-1]
                                    heading = r.get("heading", "")
                                    context_parts.append(f"\n---\n[来源: {source}" + (f" / {heading}" if heading else "") + f"]\n{r['text']}")
                                rag_context = "\n".join(context_parts)
                                logger.info(f"RAG 检索命中 {len(good_results)} 条结果")
                except Exception as e:
                    logger.warning(f"RAG 检索失败（不影响对话）: {e}")

            # 创建 LLM 适配器
            from llm.adapter import create_adapter, LLMMessage

            llm = create_adapter(
                settings.llm_provider,
                api_key=settings.llm_api_key,
                model=settings.llm_model,
                base_url=settings.llm_base_url,
                proxy=settings.llm_proxy,
            )

            if not llm.is_available():
                return {"status": "error", "message": f"LLM 服务不可用，请检查配置"}

            # 构建最终消息列表（注入文件上下文 + RAG 上下文）
            final_messages = list(messages)
            rag_results_detail = []
            # 合并文件上下文和 RAG 上下文
            context_parts = []
            if file_context:
                context_parts.append(file_context)
            if rag_context:
                context_parts.append(rag_context)
            if context_parts:
                # 插在最后一条用户消息之前（而非 position 0），避免与历史对话脱节
                insert_idx = len(final_messages)
                for i in range(len(final_messages) - 1, -1, -1):
                    if final_messages[i].get("role") == "user":
                        insert_idx = i
                        break
                final_messages.insert(insert_idx, {
                    "role": "system",
                    "content": "\n\n".join(context_parts),
                })
                # 收集 RAG 详情用于调试记录
                for r in good_results:
                    source = r["source_path"].split("\\")[-1].split("/")[-1]
                    rag_results_detail.append({
                        "source": source,
                        "heading": r.get("heading", ""),
                        "score": round(r["score"], 4),
                        "text": r["text"][:500],  # 截断过长文本
                    })

            # 转换消息格式
            llm_messages = [LLMMessage(m["role"], m["content"]) for m in final_messages]

            # 调用 LLM（计时）
            start_time = time.time()
            reply = await llm.chat(llm_messages)
            duration_ms = int((time.time() - start_time) * 1000)
            logger.info(f"LLM 回复成功，长度: {len(reply)}，耗时: {duration_ms}ms")

            # 记录到调试存储
            chat_debug_store.add({
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "model": settings.llm_model,
                "provider": settings.llm_provider,
                "duration_ms": duration_ms,
                "messages": [m.to_dict() for m in llm_messages],
                "reply": reply,
                "rag": {
                    "hits": len(rag_results_detail),
                    "results": rag_results_detail,
                }
            })

            return {"status": "ok", "reply": reply}

        except Exception as e:
            logger.error(f"对话失败: {e}")
            return {"status": "error", "message": f"对话失败: {str(e)}"}
