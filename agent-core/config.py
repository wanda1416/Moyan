"""
应用配置
支持从 ~/.moyan/config.json 读写，持久化 LLM 等配置
"""

import json
import logging
from pathlib import Path
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)


def get_moyan_dir() -> Path:
    """获取 ~/.moyan 目录"""
    return Path.home() / ".moyan"


def get_config_path() -> Path:
    """获取配置文件路径"""
    return get_moyan_dir() / "config.json"


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

    def load(self):
        """从 ~/.moyan/config.json 加载配置（覆盖默认值）"""
        config_path = get_config_path()
        if not config_path.exists():
            logger.info(f"配置文件不存在: {config_path}，使用默认配置")
            return

        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"读取配置文件失败: {e}，使用默认配置")
            return

        # 映射 JSON 字段到 Settings 属性
        field_map = {
            "llm_provider": "llm_provider",
            "llm_api_key": "llm_api_key",
            "llm_model": "llm_model",
            "llm_base_url": "llm_base_url",
            "ollama_base_url": "ollama_base_url",
            "ollama_model": "ollama_model",
            "python_host": "host",
            "python_port": "port",
        }

        for json_key, attr_name in field_map.items():
            if json_key in data and hasattr(self, attr_name):
                value = data[json_key]
                current_type = type(getattr(self, attr_name))
                # 类型安全转换
                try:
                    setattr(self, attr_name, current_type(value))
                except (ValueError, TypeError):
                    pass

        logger.info(f"配置已加载: {config_path}")

    def save(self):
        """保存配置到 ~/.moyan/config.json（合并写入，不覆盖其他字段）"""
        config_path = get_config_path()

        # 读取现有配置
        existing = {}
        if config_path.exists():
            try:
                existing = json.loads(config_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                existing = {}

        # 更新 LLM 相关字段
        existing["llm_provider"] = self.llm_provider
        existing["llm_api_key"] = self.llm_api_key
        existing["llm_model"] = self.llm_model
        existing["llm_base_url"] = self.llm_base_url
        existing["ollama_base_url"] = self.ollama_base_url
        existing["ollama_model"] = self.ollama_model

        # 确保目录存在
        config_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            config_path.write_text(
                json.dumps(existing, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            logger.info(f"配置已保存: {config_path}")
        except OSError as e:
            logger.error(f"保存配置失败: {e}")

    def to_dict(self, mask_api_key: bool = True) -> dict:
        """转为字典（用于 API 返回）"""
        result = {
            "llm_provider": self.llm_provider,
            "llm_model": self.llm_model,
            "llm_base_url": self.llm_base_url,
            "ollama_base_url": self.ollama_base_url,
            "ollama_model": self.ollama_model,
        }
        if mask_api_key:
            result["llm_api_key"] = "***" if self.llm_api_key else ""
        else:
            result["llm_api_key"] = self.llm_api_key
        return result

    def update_from_dict(self, data: dict):
        """从字典更新配置并保存"""
        field_map = {
            "llm_provider": "llm_provider",
            "llm_api_key": "llm_api_key",
            "llm_model": "llm_model",
            "llm_base_url": "llm_base_url",
            "ollama_base_url": "ollama_base_url",
            "ollama_model": "ollama_model",
        }
        for json_key, attr_name in field_map.items():
            if json_key in data:
                value = data[json_key]
                # 跳过掩码值
                if value == "***":
                    continue
                setattr(self, attr_name, str(value))
        self.save()


# 全局配置实例，启动时加载
settings = Settings()
settings.load()
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
