"""
RAG 检索模块
基于 fastembed (ONNX Runtime) + FAISS 实现项目级语义检索
"""

from rag.index import ProjectIndex

__all__ = ["ProjectIndex"]
