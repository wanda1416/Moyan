"""
Novel Agent - AI 小说协作后端
服务入口：FastAPI + WebSocket
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware

from config import settings, get_moyan_dir
from core.state import ProjectState
from agents import get_dispatcher
from memory.db import Database


def setup_logging():
    """配置文件日志"""
    log_dir = get_moyan_dir() / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    file_handler = RotatingFileHandler(
        log_dir / "backend.log",
        maxBytes=5 * 1024 * 1024,  # 5MB
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )

    # 同时输出到控制台和文件
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)


setup_logging()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 全局状态
project_state = ProjectState()
db = Database()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("Novel Agent 后端启动中...")
    db.initialize()
    logger.info("数据库初始化完成")
    yield
    db.close()
    logger.info("Novel Agent 后端已关闭")


app = FastAPI(title="Novel Agent", version="0.1.0", lifespan=lifespan)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/project")
async def get_project_info():
    """获取当前项目信息"""
    return {
        "root": project_state.root_path,
        "file_count": len(project_state.file_index),
        "indexed": project_state.is_indexed,
    }


@app.post("/api/project/open")
async def open_project(path: str):
    """打开项目目录"""
    await project_state.scan_directory(path)
    return {"status": "ok", "file_count": len(project_state.file_index)}


@app.get("/api/config")
async def get_config():
    """获取当前 LLM 配置（API Key 掩码）"""
    return settings.to_dict(mask_api_key=True)


@app.post("/api/config")
async def update_config(data: dict):
    """更新 LLM 配置并持久化"""
    settings.update_from_dict(data)
    return {"status": "ok", "config": settings.to_dict(mask_api_key=True)}


@app.post("/api/test_llm")
async def test_llm(data: dict):
    """测试 LLM 连接
    接收单个 provider entry 参数，临时创建 adapter 发送测试请求
    """
    from llm.adapter import create_adapter, LLMMessage

    provider = data.get("provider", "")
    api_key = data.get("api_key", "")
    model = data.get("model", "")
    base_url = data.get("base_url", "")
    proxy = data.get("proxy", "") if data.get("use_proxy", False) else ""

    if not provider:
        return {"status": "error", "message": "缺少 provider 参数"}

    try:
        if provider == "ollama":
            adapter = create_adapter("ollama", base_url=base_url, model=model)
        else:
            adapter = create_adapter(
                provider,
                api_key=api_key,
                model=model,
                base_url=base_url,
                proxy=proxy,
            )

        # 发送一个极简请求测试连接
        messages = [LLMMessage("user", "Hi")]
        result = await adapter.chat(messages, max_tokens=5)
        return {"status": "ok", "message": f"连接成功，模型响应正常", "preview": result[:100]}
    except ImportError as e:
        return {"status": "error", "message": f"缺少依赖: {e}，请运行: pip install {str(e).split()[-1]}"}
    except Exception as e:
        return {"status": "error", "message": f"连接失败: {str(e)}"}


@app.post("/api/list_models")
async def list_models(data: dict):
    """获取可用模型列表"""
    import aiohttp

    provider = data.get("provider", "")
    api_key = data.get("api_key", "")
    base_url = data.get("base_url", "")

    if not provider:
        return {"status": "error", "message": "缺少 provider 参数"}

    try:
        if provider == "ollama":
            # Ollama: GET /api/tags
            url = f"{base_url or 'http://localhost:11434'}/api/tags"
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    resp_data = await resp.json()
                    models = [m["name"] for m in resp_data.get("models", [])]
            return {"status": "ok", "models": models}

        elif provider == "claude":
            # Claude 没有公开模型列表 API，返回已知模型
            return {
                "status": "ok",
                "models": [
                    "claude-sonnet-4-20250514",
                    "claude-3-5-sonnet-20241022",
                    "claude-3-5-haiku-20241022",
                    "claude-3-opus-20240229",
                ],
            }

        elif provider == "gemini":
            # Gemini: 使用新 SDK 动态获取模型列表
            import os
            proxy = data.get("proxy", "")
            use_proxy = data.get("use_proxy", False)
            
            # 设置代理环境变量
            if use_proxy and proxy:
                os.environ["HTTP_PROXY"] = proxy
                os.environ["HTTPS_PROXY"] = proxy
            
            from google import genai
            client = genai.Client(api_key=api_key)
            
            models = []
            for model in client.models.list():
                # 筛选支持内容生成的模型
                if hasattr(model, "supported_actions") and "generateContent" in model.supported_actions:
                    # 模型名称格式: models/gemini-2.0-flash -> gemini-2.0-flash
                    name = model.name.replace("models/", "")
                    models.append(name)
            
            return {"status": "ok", "models": models}

        else:
            # OpenAI / 兼容 API: GET /v1/models
            url = base_url or "https://api.openai.com/v1"
            url = url.rstrip("/") + "/models"
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    resp_data = await resp.json()
                    models = [m["id"] for m in resp_data.get("data", [])]
            return {"status": "ok", "models": models}

    except Exception as e:
        return {"status": "error", "message": f"获取模型列表失败: {str(e)}"}


@app.post("/api/chat")
async def chat(request: Request):
    """对话接口 - 支持 RAG 检索增强"""
    try:
        body = await request.json()
        messages = body.get("messages", [])
        project_root = body.get("project_root", "")

        if not messages:
            return {"status": "error", "message": "缺少 messages 参数"}

        logger.info(f"收到对话请求，{len(messages)} 条消息")

        # RAG 检索增强：如果项目索引存在，自动检索相关上下文
        rag_context = ""
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

        # 构建最终消息列表（注入 RAG 上下文）
        final_messages = list(messages)
        if rag_context:
            final_messages.insert(0, {
                "role": "system",
                "content": rag_context,
            })

        # 转换消息格式
        llm_messages = [LLMMessage(m["role"], m["content"]) for m in final_messages]

        # 调用 LLM
        reply = await llm.chat(llm_messages)
        logger.info(f"LLM 回复成功，长度: {len(reply)}")

        return {"status": "ok", "reply": reply}

    except Exception as e:
        logger.error(f"对话失败: {e}")
        return {"status": "error", "message": f"对话失败: {str(e)}"}


# ============================================================
# RAG 检索接口
# ============================================================

@app.post("/api/rag/build_index")
async def rag_build_index(data: dict):
    """为项目构建 RAG 向量索引"""
    project_root = data.get("project_root", "")
    if not project_root:
        return {"status": "error", "message": "缺少 project_root 参数"}

    try:
        from rag.index import get_project_index
        pindex = get_project_index()
        result = pindex.build_index(project_root)
        return {"status": "ok", "chunks": result["chunks"], "duration": result["duration"]}
    except ImportError as e:
        return {"status": "error", "message": f"缺少依赖: {e}，请运行: pip install sentence-transformers faiss-cpu"}
    except Exception as e:
        logger.error(f"构建索引失败: {e}")
        return {"status": "error", "message": f"构建索引失败: {str(e)}"}


@app.post("/api/rag/search")
async def rag_search(data: dict):
    """语义检索"""
    project_root = data.get("project_root", "")
    query = data.get("query", "")
    top_k = data.get("top_k", 5)

    if not project_root or not query:
        return {"status": "error", "message": "缺少 project_root 或 query 参数"}

    try:
        from rag.index import get_project_index
        pindex = get_project_index()
        results = pindex.search(project_root, query, top_k=top_k)
        return {"status": "ok", "results": results}
    except Exception as e:
        logger.error(f"检索失败: {e}")
        return {"status": "error", "message": f"检索失败: {str(e)}"}


@app.get("/api/rag/index_status")
async def rag_index_status(project_root: str = ""):
    """获取索引状态"""
    if not project_root:
        return {"indexed": False, "chunks": 0, "built_at": ""}

    try:
        from rag.index import get_project_index
        pindex = get_project_index()
        return pindex.get_index_status(project_root)
    except Exception as e:
        return {"indexed": False, "chunks": 0, "built_at": "", "error": str(e)}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 端点 - Agent 通信"""
    await websocket.accept()
    dispatcher = get_dispatcher()
    current_file: str | None = None

    logger.info("WebSocket 客户端已连接")

    try:
        while True:
            data = await websocket.receive_text()
            try:
                request = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({
                    "request_id": None,
                    "success": False,
                    "agent_type": None,
                    "content": "无效的 JSON 格式",
                    "error_type": "invalid_json",
                })
                continue

            request_id = request.get("request_id")
            agent_type = request.get("agent_type")
            action = request.get("action")

            logger.info(f"收到请求: id={request_id}, agent={agent_type}, action={action}")

            # 特殊动作：设置当前文件
            if action == "set_current_file":
                current_file = request.get("file_path")
                logger.info(f"当前文件已设置: {current_file}")
                # 自动检索关联文件
                related = []
                if current_file and project_state.is_indexed:
                    from core.retriever import Retriever
                    retriever = Retriever(project_state)
                    related = retriever.get_related_files(current_file)
                await websocket.send_json({
                    "request_id": request_id,
                    "success": True,
                    "agent_type": None,
                    "content": f"当前文件: {current_file}",
                    "references": [r["path"] for r in related],
                    "structured_data": {"related_files": related, "current_file": current_file},
                })
                continue

            # 特殊动作：ping
            if action == "ping":
                await websocket.send_json({
                    "request_id": request_id,
                    "success": True,
                    "agent_type": None,
                    "content": "pong",
                })
                continue

            # 校验必要字段
            if not agent_type:
                await websocket.send_json({
                    "request_id": request_id,
                    "success": False,
                    "agent_type": None,
                    "content": "缺少 agent_type 字段",
                    "error_type": "missing_field",
                })
                continue

            # 自动注入当前文件上下文
            payload = request.get("payload", {})
            if current_file and "file_path" not in payload:
                payload["file_path"] = current_file

            # 调度到对应 Agent
            result = await dispatcher.dispatch(
                agent_type=agent_type,
                action=action,
                payload=payload,
                project_state=project_state,
            )
            result["request_id"] = request_id

            await websocket.send_json(result)

    except WebSocketDisconnect:
        logger.info("WebSocket 连接已断开")
    except Exception as e:
        logger.error(f"WebSocket 错误: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass


if __name__ == "__main__":
    import argparse
    import uvicorn

    # 命令行参数（sidecar 模式由 Tauri 注入；dev 模式无参走默认）
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=settings.host, help="绑定地址")
    parser.add_argument("--port", type=int, default=settings.port, help="绑定端口")
    args = parser.parse_args()

    # reload=False: 进程生命周期由 Tauri PythonBridge 管理，不需要 uvicorn 自己监控文件变化
    # 直接传 app 对象而非字符串，避免 Windows 下 multiprocessing spawn 产生多余进程
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        reload=False,
    )
