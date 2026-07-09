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

    # 多 LLM 供应商配置（新格式）
    active_provider_id: str = "provider_1"
    llm_providers: list = field(default_factory=lambda: [
        {
            "id": "provider_1",
            "name": "OpenAI",
            "provider": "openai",
            "api_key": "",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o",
        }
    ])

    def get_active_provider(self) -> dict:
        """获取当前激活的供应商配置"""
        for p in self.llm_providers:
            if p.get("id") == self.active_provider_id:
                return p
        # 回退到第一个
        return self.llm_providers[0] if self.llm_providers else {}

    @property
    def llm_provider(self) -> str:
        """向后兼容：返回激活供应商的 provider 类型"""
        return self.get_active_provider().get("provider", "openai")

    @property
    def llm_api_key(self) -> str:
        """向后兼容：返回激活供应商的 API Key"""
        return self.get_active_provider().get("api_key", "")

    @property
    def llm_model(self) -> str:
        """向后兼容：返回激活供应商的模型"""
        return self.get_active_provider().get("model", "gpt-4")

    @property
    def llm_base_url(self) -> str:
        """向后兼容：返回激活供应商的 Base URL"""
        p = self.get_active_provider()
        if p.get("provider") == "ollama":
            return p.get("base_url", "http://localhost:11434")
        return p.get("base_url", "")

    @property
    def ollama_base_url(self) -> str:
        """向后兼容：返回 Ollama 供应商的 Base URL"""
        for p in self.llm_providers:
            if p.get("provider") == "ollama":
                return p.get("base_url", "http://localhost:11434")
        return "http://localhost:11434"

    @property
    def ollama_model(self) -> str:
        """向后兼容：返回 Ollama 供应商的模型"""
        for p in self.llm_providers:
            if p.get("provider") == "ollama":
                return p.get("model", "llama3")
        return "llama3"

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

        # 基础字段
        basic_map = {
            "python_host": "host",
            "python_port": "port",
        }
        for json_key, attr_name in basic_map.items():
            if json_key in data and hasattr(self, attr_name):
                value = data[json_key]
                current_type = type(getattr(self, attr_name))
                try:
                    setattr(self, attr_name, current_type(value))
                except (ValueError, TypeError):
                    pass

        # 新格式：多供应商配置
        if "llm_providers" in data and "active_provider_id" in data:
            self.llm_providers = data["llm_providers"]
            self.active_provider_id = data["active_provider_id"]
            logger.info(f"配置已加载（多供应商）: {config_path}")
            return

        # 旧格式迁移：将 llm_provider/llm_model 等字段转为 provider entries
        logger.info(f"检测到旧格式配置，自动迁移: {config_path}")
        old_provider = data.get("llm_provider", "openai")
        old_model = data.get("llm_model", "gpt-4")
        old_api_key = data.get("llm_api_key", "")
        old_base_url = data.get("llm_base_url", "")
        ollama_base_url = data.get("ollama_base_url", "http://localhost:11434")
        ollama_model = data.get("ollama_model", "llama3")

        providers = []
        if old_provider != "ollama":
            providers.append({
                "id": "provider_1",
                "name": "Claude" if old_provider == "claude" else "OpenAI",
                "provider": old_provider,
                "api_key": old_api_key,
                "base_url": old_base_url,
                "model": old_model,
            })

        ollama_id = "provider_1" if not providers else "provider_2"
        providers.append({
            "id": ollama_id,
            "name": "Ollama",
            "provider": "ollama",
            "api_key": "",
            "base_url": ollama_base_url,
            "model": ollama_model,
        })

        self.llm_providers = providers
        self.active_provider_id = ollama_id if old_provider == "ollama" else "provider_1"

        # 写回新格式
        self.save()
        logger.info(f"配置已迁移并保存: {config_path}")

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

        # 更新基础字段
        existing["host"] = self.host
        existing["port"] = self.port

        # 更新多供应商配置
        existing["active_provider_id"] = self.active_provider_id
        existing["llm_providers"] = self.llm_providers

        # 清理旧格式字段
        for key in ["llm_provider", "llm_model", "llm_base_url", "llm_api_key", "ollama_base_url", "ollama_model"]:
            existing.pop(key, None)

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
        providers = []
        for p in self.llm_providers:
            entry = {
                "id": p.get("id", ""),
                "name": p.get("name", ""),
                "provider": p.get("provider", ""),
                "base_url": p.get("base_url", ""),
                "model": p.get("model", ""),
            }
            api_key = p.get("api_key", "")
            if mask_api_key:
                entry["api_key"] = "***" if api_key else ""
            else:
                entry["api_key"] = api_key
            providers.append(entry)

        return {
            "active_provider_id": self.active_provider_id,
            "llm_providers": providers,
        }

    def update_from_dict(self, data: dict):
        """从字典更新配置并保存"""
        if "active_provider_id" in data:
            self.active_provider_id = str(data["active_provider_id"])

        if "llm_providers" in data:
            new_providers = []
            for p in data["llm_providers"]:
                entry = {
                    "id": str(p.get("id", "")),
                    "name": str(p.get("name", "")),
                    "provider": str(p.get("provider", "")),
                    "base_url": str(p.get("base_url", "")),
                    "model": str(p.get("model", "")),
                }
                api_key = p.get("api_key", "")
                # 跳过掩码值，保留旧值
                if api_key and api_key != "***":
                    entry["api_key"] = str(api_key)
                else:
                    # 查找旧配置中的 api_key
                    old_entry = next((ep for ep in self.llm_providers if ep.get("id") == entry["id"]), {})
                    entry["api_key"] = old_entry.get("api_key", "")
                new_providers.append(entry)
            self.llm_providers = new_providers

        self.save()


# 全局配置实例，启动时加载
settings = Settings()
settings.load()
