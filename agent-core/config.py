"""应用配置"""

from dataclasses import dataclass, field


@dataclass
class Settings:
    """全局配置"""
    host: str = "127.0.0.1"
    port: int = 8765
    db_path: str = "novel_agent.db"
    project_root: str = ""

    # LLM 配置
    llm_provider: str = "openai"
    llm_api_key: str = ""
    llm_model: str = "gpt-4"
    llm_base_url: str = ""

    # Ollama 配置
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"


settings = Settings()
