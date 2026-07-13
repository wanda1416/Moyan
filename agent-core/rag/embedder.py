"""
Embedding 封装
基于 fastembed (ONNX Runtime) 的本地向量编码
"""

import logging
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)

# 默认模型（中文优化，ONNX 格式，~100MB）
DEFAULT_MODEL = "BAAI/bge-small-zh-v1.5"


class Embedder:
    """
    fastembed 向量编码器（ONNX Runtime 后端）
    懒加载模型，首次调用时才初始化
    """

    def __init__(self, model_name: str = DEFAULT_MODEL):
        self.model_name = model_name
        self._model = None  # 懒加载
        self._dimension = 512  # bge-small-zh-v1.5 固定 512 维

    def _ensure_loaded(self):
        """确保模型已加载"""
        if self._model is not None:
            return

        logger.info(f"正在加载 Embedding 模型: {self.model_name} ...")
        try:
            from fastembed import TextEmbedding
            self._model = TextEmbedding(model_name=self.model_name)
            logger.info(f"Embedding 模型加载完成: {self.model_name}")
        except Exception as e:
            logger.error(f"加载 Embedding 模型失败: {e}")
            raise

    def encode(self, texts: list[str], batch_size: int = 64) -> np.ndarray:
        """
        批量编码文本为向量
        返回 L2 归一化的向量（用于内积相似度 = 余弦相似度）
        """
        self._ensure_loaded()

        embeddings = list(self._model.passage_embed(texts, batch_size=batch_size))
        result = np.array(embeddings, dtype=np.float32)

        # L2 归一化
        norms = np.linalg.norm(result, axis=1, keepdims=True)
        norms = np.maximum(norms, 1e-12)
        return result / norms

    def encode_query(self, query: str) -> np.ndarray:
        """编码单条查询"""
        self._ensure_loaded()

        emb = list(self._model.query_embed([query]))
        vec = np.array(emb, dtype=np.float32)
        norm = np.linalg.norm(vec)
        return vec / max(norm, 1e-12)

    @property
    def dimension(self) -> int:
        """向量维度"""
        return self._dimension
