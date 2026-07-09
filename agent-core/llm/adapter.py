"""
LLM 统一接口
定义所有 LLM 客户端的公共接口
"""

from abc import ABC, abstractmethod
from typing import Optional


class LLMMessage:
    """消息"""
    def __init__(self, role: str, content: str):
        self.role = role  # "system" | "user" | "assistant"
        self.content = content

    def to_dict(self) -> dict:
        return {"role": self.role, "content": self.content}


class LLMAdapter(ABC):
    """LLM 适配器基类"""

    @abstractmethod
    async def chat(self, messages: list[LLMMessage], **kwargs) -> str:
        """
        发送对话请求
        :param messages: 消息列表
        :return: 模型回复文本
        """
        pass

    @abstractmethod
    async def chat_json(self, messages: list[LLMMessage], **kwargs) -> dict:
        """
        发送对话请求，期望返回 JSON
        :param messages: 消息列表
        :return: 解析后的 JSON 字典
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """检查服务是否可用"""
        pass


def create_adapter(provider: str, **kwargs) -> LLMAdapter:
    """工厂方法：根据 provider 创建对应适配器"""
    if provider == "openai":
        from llm.openai_client import OpenAIClient
        return OpenAIClient(**kwargs)
    elif provider == "claude":
        from llm.claude_client import ClaudeClient
        return ClaudeClient(**kwargs)
    elif provider == "ollama":
        from llm.ollama_client import OllamaClient
        return OllamaClient(**kwargs)
    elif provider == "gemini":
        from llm.gemini_client import GeminiClient
        return GeminiClient(**kwargs)
    else:
        raise ValueError(f"不支持的 LLM provider: {provider}")
