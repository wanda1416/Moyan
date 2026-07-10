"""
项目向量索引管理
基于 FAISS 构建和检索项目级 RAG 索引
"""

import json
import time
import logging
from pathlib import Path
from typing import Optional

import numpy as np

from config import get_moyan_dir
from rag.chunker import chunk_markdown, Chunk
from rag.embedder import Embedder

logger = logging.getLogger(__name__)


def _project_path_to_uid(path: str) -> str:
    """项目路径转 UID（与 Rust 端 app_dir.rs 的 DJB2 hash 保持一致）"""
    hash_val = 5381
    for byte in path.encode('utf-8'):
        hash_val = ((hash_val * 33) + byte) & 0xFFFFFFFFFFFFFFFF
    return f"{hash_val:016x}"


def _get_index_dir(project_root: str) -> Path:
    """获取项目索引目录 ~/.moyan/projects/index-{uid}/"""
    uid = _project_path_to_uid(project_root)
    return get_moyan_dir() / "projects" / f"index-{uid}"


class ProjectIndex:
    """
    项目级向量索引
    管理 FAISS 索引的构建、保存、加载和检索
    """

    def __init__(self, embedder: Optional[Embedder] = None):
        self.embedder = embedder or Embedder()
        # 缓存已加载的索引（按 project_root 索引）
        self._loaded_indexes: dict[str, dict] = {}

    def build_index(self, project_root: str) -> dict:
        """
        为项目构建向量索引

        流程：
        1. 递归扫描 *.md 文件
        2. 分块
        3. 编码
        4. 构建 FAISS 索引
        5. 持久化

        返回: { chunks: int, duration: float }
        """
        import faiss

        start_time = time.time()
        project_path = Path(project_root)

        if not project_path.exists():
            raise ValueError(f"项目目录不存在: {project_root}")

        # 1. 扫描所有 Markdown 文件
        md_files = list(project_path.rglob("*.md"))
        # 过滤隐藏目录
        md_files = [f for f in md_files if not any(p.startswith('.') for p in f.parts)]

        if not md_files:
            raise ValueError("项目目录中没有找到 Markdown 文件")

        logger.info(f"扫描到 {len(md_files)} 个 Markdown 文件")

        # 2. 分块
        all_chunks: list[Chunk] = []
        for md_file in md_files:
            try:
                content = md_file.read_text(encoding='utf-8')
                chunks = chunk_markdown(content, str(md_file))
                all_chunks.extend(chunks)
            except Exception as e:
                logger.warning(f"处理文件失败 {md_file}: {e}")
                continue

        if not all_chunks:
            raise ValueError("没有生成任何有效片段")

        logger.info(f"共生成 {len(all_chunks)} 个文档片段")

        # 3. 编码
        texts = [c.text for c in all_chunks]
        embeddings = self.embedder.encode(texts, batch_size=32)

        # 4. 构建 FAISS 索引（内积 = 余弦相似度，因为已归一化）
        dimension = embeddings.shape[1]
        index = faiss.IndexFlatIP(dimension)
        index.add(embeddings)

        # 5. 持久化
        index_dir = _get_index_dir(project_root)
        index_dir.mkdir(parents=True, exist_ok=True)

        # 保存 FAISS 索引
        faiss.write_index(index, str(index_dir / "index.faiss"))

        # 保存 chunk 元数据
        chunks_meta = [
            {
                "chunk_id": c.chunk_id,
                "text": c.text,
                "source_path": c.source_path,
                "heading": c.heading,
            }
            for c in all_chunks
        ]
        meta_path = index_dir / "chunks.json"
        meta_path.write_text(
            json.dumps(chunks_meta, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )

        # 保存索引信息
        built_at = time.strftime("%Y-%m-%dT%H:%M:%S")
        info = {
            "chunks": len(all_chunks),
            "dimension": dimension,
            "built_at": built_at,
            "project_root": project_root,
        }
        info_path = index_dir / "index_info.json"
        info_path.write_text(
            json.dumps(info, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )

        duration = time.time() - start_time

        # 更新缓存
        self._loaded_indexes[project_root] = {
            "index": index,
            "chunks": chunks_meta,
            "info": info,
        }

        logger.info(f"索引构建完成: {len(all_chunks)} 个片段, 耗时 {duration:.1f}s")

        return {
            "chunks": len(all_chunks),
            "duration": round(duration, 1),
        }

    def search(self, project_root: str, query: str, top_k: int = 5) -> list[dict]:
        """
        语义检索

        返回: [{ text, source_path, heading, score }]
        """
        import faiss

        # 加载索引
        index_data = self._load_index(project_root)
        if not index_data:
            return []

        faiss_index = index_data["index"]
        chunks = index_data["chunks"]

        # 编码查询
        query_vec = self.embedder.encode_query(query)

        # 检索
        actual_k = min(top_k, faiss_index.ntotal)
        scores, indices = faiss_index.search(query_vec, actual_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(chunks):
                continue
            chunk = chunks[idx]
            results.append({
                "text": chunk["text"],
                "source_path": chunk["source_path"],
                "heading": chunk["heading"],
                "score": float(score),
            })

        return results

    def get_index_status(self, project_root: str) -> dict:
        """
        获取索引状态

        返回: { indexed: bool, chunks: int, built_at: str }
        """
        index_dir = _get_index_dir(project_root)
        info_path = index_dir / "index_info.json"

        if not info_path.exists():
            return {"indexed": False, "chunks": 0, "built_at": ""}

        try:
            info = json.loads(info_path.read_text(encoding='utf-8'))
            return {
                "indexed": True,
                "chunks": info.get("chunks", 0),
                "built_at": info.get("built_at", ""),
            }
        except Exception:
            return {"indexed": False, "chunks": 0, "built_at": ""}

    def _load_index(self, project_root: str) -> Optional[dict]:
        """加载项目索引到内存（带缓存）"""
        import faiss

        # 已缓存
        if project_root in self._loaded_indexes:
            return self._loaded_indexes[project_root]

        index_dir = _get_index_dir(project_root)
        faiss_path = index_dir / "index.faiss"
        chunks_path = index_dir / "chunks.json"

        if not faiss_path.exists() or not chunks_path.exists():
            return None

        try:
            index = faiss.read_index(str(faiss_path))
            chunks = json.loads(chunks_path.read_text(encoding='utf-8'))

            info = {}
            info_path = index_dir / "index_info.json"
            if info_path.exists():
                info = json.loads(info_path.read_text(encoding='utf-8'))

            data = {"index": index, "chunks": chunks, "info": info}
            self._loaded_indexes[project_root] = data
            return data
        except Exception as e:
            logger.error(f"加载索引失败: {e}")
            return None


# 全局单例（进程内共享）
_project_index: Optional[ProjectIndex] = None


def get_project_index() -> ProjectIndex:
    """获取全局 ProjectIndex 单例"""
    global _project_index
    if _project_index is None:
        _project_index = ProjectIndex()
    return _project_index
