"""
LLM 配置与测试路由
/api/config、/api/test_llm、/api/list_models
"""

import logging
from fastapi import FastAPI

from config import settings

logger = logging.getLogger(__name__)


def register_llm_routes(app: FastAPI):
    """注册 LLM 相关路由"""

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
