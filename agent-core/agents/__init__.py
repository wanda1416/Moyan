"""Agent 模块"""

from agents.base import BaseAgent, AgentDispatcher
from agents.lore_keeper import LoreKeeper
from agents.beat_maker import BeatMaker
from agents.scribe import Scribe
from agents.guardian import Guardian
from agents.foreshadowing_clerk import ForeshadowingClerk

# Agent 注册表
_AGENT_REGISTRY = {
    "lore_keeper": LoreKeeper,
    "beat_maker": BeatMaker,
    "scribe": Scribe,
    "guardian": Guardian,
    "foreshadowing_clerk": ForeshadowingClerk,
}


def get_dispatcher() -> AgentDispatcher:
    """获取 Agent 调度器"""
    dispatcher = AgentDispatcher()
    for name, agent_class in _AGENT_REGISTRY.items():
        dispatcher.register(name, agent_class())
    return dispatcher
