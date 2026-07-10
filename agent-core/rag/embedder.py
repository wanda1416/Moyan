"""
Embedding 封装
基于 sentence-transformers 的本地向量编码
"""

import logging
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)

# 默认模型（中文优化，~100MB）
DEFAULT_MODEL = "BAAI/bge-small-zh-v1.5"


class Embedder:
    """
    sentence-transformers 向量编码器
    懒加载模型，首次调用时才初始化
    """

    def __init__(self, model_name: str = DEFAULT_MODEL):
        self.model_name = model_name
        self._model = None  # 懒加载

    def _ensure_loaded(self):
        """确保模型已加载"""
        if self._model is not None:
            return

        logger.info(f"正在加载 Embedding 模型: {self.model_name} ...")
        try:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_name)
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

        embeddings = self._model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=False,
            normalize_embeddings=True,  # L2 归一化
        )
        return np.array(embeddings, dtype=np.float32)

    def encode_query(self, query: str) -> np.ndarray:
        """编码单条查询"""
        return self.encode([query])

    @property
    def dimension(self) -> int:
        """向量维度"""
        self._ensure_loaded()
        return self._model.get_sentence_embedding_dimension()
