"""
Agent 基类 & 调度器
"""

import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


class BaseAgent(ABC):
    """Agent 基类"""

    name: str = "base"
    description: str = ""

    def __init__(self):
        self.system_prompt = self._load_prompt()

    def _load_prompt(self) -> str:
        """从 prompts/ 目录加载系统提示词"""
        prompt_file = PROMPTS_DIR / f"{self.name}.txt"
        if prompt_file.exists():
            return prompt_file.read_text(encoding="utf-8")
        logger.warning(f"未找到 {self.name} 的提示词文件: {prompt_file}")
        return ""

    @abstractmethod
    async def execute(self, action: str, payload: dict, context: dict) -> dict:
        """
        执行 Agent 核心逻辑
        :param action: 动作类型
        :param payload: 请求参数
        :param context: 上下文信息 (项目状态、关联文件等)
        :return: 结构化响应
        """
        pass

    def build_response(self, content: str, success: bool = True,
                       references: Optional[list] = None,
                       structured_data: Optional[dict] = None) -> dict:
        """构建标准响应"""
        return {
            "success": success,
            "agent_type": self.name,
            "content": content,
            "references": references or [],
            "structured_data": structured_data or {},
        }


class AgentDispatcher:
    """Agent 调度器"""

    def __init__(self):
        self._agents: dict[str, BaseAgent] = {}

    def register(self, name: str, agent: BaseAgent):
        """注册 Agent"""
        self._agents[name] = agent
        logger.info(f"注册 Agent: {name}")

    async def dispatch(self, agent_type: str, action: str,
                       payload: dict, project_state=None) -> dict:
        """
        调度请求到对应 Agent
        """
        agent = self._agents.get(agent_type)
        if not agent:
            return {
                "success": False,
                "agent_type": agent_type,
                "content": f"未知的 Agent 类型: {agent_type}",
            }

        try:
            context = {
                "project_state": project_state,
            }
            return await agent.execute(action, payload, context)
        except Exception as e:
            logger.error(f"Agent {agent_type} 执行失败: {e}")
            return {
                "success": False,
                "agent_type": agent_type,
                "content": f"执行失败: {str(e)}",
            }
