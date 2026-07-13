"""
项目向量索引管理
基于 FAISS 构建和检索项目级 RAG 索引
"""

import hashlib
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

# ── RAG dependency diagnostics (logged once at import time) ──
_rag_deps_ok = True
for _dep_name, _dep_mod in [('numpy', 'np'), ('faiss', 'faiss'), ('fastembed', 'TextEmbedding')]:
    try:
        __import__(_dep_name)
        logger.debug(f"[RAG] {_dep_name}: OK")
    except Exception as _e:
        _rag_deps_ok = False
        logger.error(f"[RAG] {_dep_name}: FAIL - {_e}")
if not _rag_deps_ok:
    logger.error("[RAG] Some dependencies failed to load. RAG features will be unavailable.")


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

    # -----------------------------------------------------------
    # 辅助方法：文件哈希 & manifest 读写
    # -----------------------------------------------------------

    @staticmethod
    def _compute_file_hash(path: Path) -> str:
        """计算文件内容的 MD5 哈希"""
        h = hashlib.md5()
        h.update(path.read_bytes())
        return h.hexdigest()

    @staticmethod
    def _load_manifest(index_dir: Path) -> Optional[dict]:
        """加载 manifest.json，不存在返回 None"""
        manifest_path = index_dir / "manifest.json"
        if not manifest_path.exists():
            return None
        try:
            return json.loads(manifest_path.read_text(encoding='utf-8'))
        except Exception:
            return None

    @staticmethod
    def _save_manifest(index_dir: Path, manifest: dict) -> None:
        """保存 manifest.json"""
        manifest_path = index_dir / "manifest.json"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )

    # -----------------------------------------------------------
    # 全量构建
    # -----------------------------------------------------------

    def build_index(self, project_root: str) -> dict:
        """
        为项目构建向量索引（全量）

        流程：
        1. 递归扫描 *.md 文件
        2. 分块
        3. 编码
        4. 构建 FAISS 索引
        5. 持久化（含 embeddings.npy + manifest.json）

        返回: { chunks: int, duration: float }
        """
        import faiss

        start_time = time.time()
        project_path = Path(project_root)

        if not project_path.exists():
            raise ValueError(f"项目目录不存在: {project_root}")

        # 1. 扫描所有 Markdown 文件
        md_files = list(project_path.rglob("*.md"))
        md_files = [f for f in md_files if not any(p.startswith('.') for p in f.parts)]

        if not md_files:
            raise ValueError("项目目录中没有找到 Markdown 文件")

        logger.info(f"扫描到 {len(md_files)} 个 Markdown 文件")

        # 2. 分块（按文件分组）
        file_chunks: dict[str, list[Chunk]] = {}
        for md_file in md_files:
            try:
                content = md_file.read_text(encoding='utf-8')
                chunks = chunk_markdown(content, str(md_file))
                rel_path = str(md_file.relative_to(project_path))
                file_chunks[rel_path] = chunks
            except Exception as e:
                logger.warning(f"处理文件失败 {md_file}: {e}")
                continue

        if not file_chunks:
            raise ValueError("没有生成任何有效片段")

        # 3. 编码
        all_chunks: list[Chunk] = []
        for chunks in file_chunks.values():
            all_chunks.extend(chunks)
        texts = [c.text for c in all_chunks]
        embeddings = self.embedder.encode(texts, batch_size=32)

        # 4. 构建 FAISS 索引
        dimension = embeddings.shape[1]
        index = faiss.IndexFlatIP(dimension)
        index.add(embeddings)

        # 5. 持久化
        index_dir = _get_index_dir(project_root)
        index_dir.mkdir(parents=True, exist_ok=True)

        faiss.write_index(index, str(index_dir / "index.faiss"))

        # 保存 embeddings 缓存
        np.save(str(index_dir / "embeddings.npy"), embeddings)

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

        # 构建 manifest
        manifest_files = {}
        offset = 0
        for rel_path, chunks in file_chunks.items():
            md_file = project_path / rel_path
            manifest_files[rel_path] = {
                "content_hash": self._compute_file_hash(md_file),
                "chunk_indices": list(range(offset, offset + len(chunks))),
                "chunk_count": len(chunks),
            }
            offset += len(chunks)

        manifest = {
            "files": manifest_files,
            "total_chunks": len(all_chunks),
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        self._save_manifest(index_dir, manifest)

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

        logger.info(f"索引全量构建完成: {len(all_chunks)} 个片段, 耗时 {duration:.1f}s")

        return {
            "chunks": len(all_chunks),
            "duration": round(duration, 1),
        }

    # -----------------------------------------------------------
    # 增量刷新
    # -----------------------------------------------------------

    def refresh_index(self, project_root: str) -> dict:
        """
        增量刷新索引

        通过文件内容哈希检测变更，仅对变动文件重新编码，
        未变更文件复用缓存的 embedding 向量。

        返回: { chunks, duration, incremental, added_files, modified_files, deleted_files, unchanged_files }
        """
        import faiss

        start_time = time.time()
        project_path = Path(project_root)
        index_dir = _get_index_dir(project_root)

        # 加载 manifest 和 embeddings 缓存
        manifest = self._load_manifest(index_dir)
        embeddings_path = index_dir / "embeddings.npy"

        if manifest is None or not embeddings_path.exists():
            # 无法增量，fallback 到全量构建
            logger.info("无 manifest 或 embeddings 缓存，fallback 到全量构建")
            result = self.build_index(project_root)
            result["incremental"] = False
            return result

        old_embeddings = np.load(str(embeddings_path))
        old_manifest_files: dict = manifest.get("files", {})

        # 扫描当前文件
        md_files = list(project_path.rglob("*.md"))
        md_files = [f for f in md_files if not any(p.startswith('.') for p in f.parts)]
        current_file_map: dict[str, Path] = {}
        for f in md_files:
            rel = str(f.relative_to(project_path))
            current_file_map[rel] = f

        # 分类：unchanged / modified+new / deleted
        unchanged_files: list[str] = []
        changed_files: list[str] = []
        deleted_files: list[str] = []

        for rel_path, abs_path in current_file_map.items():
            current_hash = self._compute_file_hash(abs_path)
            old_entry = old_manifest_files.get(rel_path)
            if old_entry and old_entry.get("content_hash") == current_hash:
                unchanged_files.append(rel_path)
            else:
                changed_files.append(rel_path)

        for rel_path in old_manifest_files:
            if rel_path not in current_file_map:
                deleted_files.append(rel_path)

        # 如果没有任何变更，直接返回
        if not changed_files and not deleted_files:
            duration = time.time() - start_time
            logger.info(f"增量刷新：无文件变更，耗时 {duration:.1f}s")
            info = json.loads((index_dir / "index_info.json").read_text(encoding='utf-8'))
            return {
                "chunks": info.get("chunks", 0),
                "duration": round(duration, 1),
                "incremental": True,
                "added_files": 0,
                "modified_files": 0,
                "deleted_files": 0,
                "unchanged_files": len(unchanged_files),
            }

        logger.info(f"增量刷新：不变 {len(unchanged_files)}, 变更 {len(changed_files)}, 删除 {len(deleted_files)}")

        # 收集保留的 chunk 和 embedding 行
        kept_chunk_indices: list[int] = []
        kept_chunks_meta: list[dict] = []
        old_chunks = json.loads((index_dir / "chunks.json").read_text(encoding='utf-8'))

        for rel_path in unchanged_files:
            entry = old_manifest_files[rel_path]
            kept_chunk_indices.extend(entry["chunk_indices"])

        # 保留的 embeddings
        if kept_chunk_indices:
            kept_embeddings = old_embeddings[kept_chunk_indices]
        else:
            kept_embeddings = np.empty((0, old_embeddings.shape[1]), dtype=np.float32)

        # 对变更文件重新分块+编码
        new_chunks: list[Chunk] = []
        for rel_path in changed_files:
            abs_path = current_file_map[rel_path]
            try:
                content = abs_path.read_text(encoding='utf-8')
                chunks = chunk_markdown(content, str(abs_path))
                new_chunks.extend(chunks)
            except Exception as e:
                logger.warning(f"处理文件失败 {abs_path}: {e}")

        # 编码新片段
        if new_chunks:
            new_texts = [c.text for c in new_chunks]
            new_embeddings = self.embedder.encode(new_texts, batch_size=32)
        else:
            new_embeddings = np.empty((0, old_embeddings.shape[1]), dtype=np.float32)

        # 拼接 embeddings
        parts = []
        if kept_embeddings.shape[0] > 0:
            parts.append(kept_embeddings)
        if new_embeddings.shape[0] > 0:
            parts.append(new_embeddings)

        if not parts:
            raise ValueError("刷新后没有任何有效片段")

        all_embeddings = np.vstack(parts)

        # 重新构建 FAISS
        dimension = all_embeddings.shape[1]
        index = faiss.IndexFlatIP(dimension)
        index.add(all_embeddings)

        # 构建新的 chunks_meta（先保留的，再新增的）
        new_chunks_meta = []
        for idx in kept_chunk_indices:
            new_chunks_meta.append(old_chunks[idx])
        for c in new_chunks:
            new_chunks_meta.append({
                "chunk_id": c.chunk_id,
                "text": c.text,
                "source_path": c.source_path,
                "heading": c.heading,
            })

        # 重排 chunk_id
        for i, meta in enumerate(new_chunks_meta):
            meta["chunk_id"] = f"{meta['source_path']}#{i + 1}"

        # 构建新 manifest
        new_manifest_files: dict = {}
        offset = 0

        # 先统计 unchanged 文件（按原始顺序）
        for rel_path in unchanged_files:
            old_entry = old_manifest_files[rel_path]
            count = old_entry["chunk_count"]
            new_manifest_files[rel_path] = {
                "content_hash": old_entry["content_hash"],
                "chunk_indices": list(range(offset, offset + count)),
                "chunk_count": count,
            }
            offset += count

        # 再统计 changed 文件
        changed_chunk_offset = offset
        file_chunk_counts: dict[str, int] = {}
        for c in new_chunks:
            rel = str(Path(c.source_path).relative_to(project_path))
            file_chunk_counts[rel] = file_chunk_counts.get(rel, 0) + 1
        for rel_path in changed_files:
            count = file_chunk_counts.get(rel_path, 0)
            if count > 0:
                abs_path = current_file_map[rel_path]
                new_manifest_files[rel_path] = {
                    "content_hash": self._compute_file_hash(abs_path),
                    "chunk_indices": list(range(changed_chunk_offset, changed_chunk_offset + count)),
                    "chunk_count": count,
                }
                changed_chunk_offset += count

        new_manifest = {
            "files": new_manifest_files,
            "total_chunks": len(new_chunks_meta),
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }

        # 持久化
        faiss.write_index(index, str(index_dir / "index.faiss"))
        np.save(str(index_dir / "embeddings.npy"), all_embeddings)

        meta_path = index_dir / "chunks.json"
        meta_path.write_text(
            json.dumps(new_chunks_meta, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )
        self._save_manifest(index_dir, new_manifest)

        info = {
            "chunks": len(new_chunks_meta),
            "dimension": dimension,
            "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "project_root": project_root,
        }
        info_path = index_dir / "index_info.json"
        info_path.write_text(
            json.dumps(info, ensure_ascii=False, indent=2),
            encoding='utf-8',
        )

        duration = time.time() - start_time

        # 更新内存缓存
        self._loaded_indexes[project_root] = {
            "index": index,
            "chunks": new_chunks_meta,
            "info": info,
        }

        logger.info(f"增量刷新完成: {len(new_chunks_meta)} 个片段, 耗时 {duration:.1f}s")

        return {
            "chunks": len(new_chunks_meta),
            "duration": round(duration, 1),
            "incremental": True,
            "added_files": len([f for f in changed_files if f not in old_manifest_files]),
            "modified_files": len([f for f in changed_files if f in old_manifest_files]),
            "deleted_files": len(deleted_files),
            "unchanged_files": len(unchanged_files),
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
