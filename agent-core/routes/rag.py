"""
RAG 检索接口路由
/api/rag/build_index、/api/rag/refresh_index、/api/rag/search、/api/rag/index_status
"""

import logging
from fastapi import FastAPI

logger = logging.getLogger(__name__)


def register_rag_routes(app: FastAPI):
    """注册 RAG 相关路由"""

    @app.post("/api/rag/build_index")
    async def rag_build_index(data: dict):
        """为项目构建 RAG 向量索引（全量）"""
        project_root = data.get("project_root", "")
        if not project_root:
            return {"status": "error", "message": "缺少 project_root 参数"}

        try:
            from rag.index import get_project_index
            pindex = get_project_index()
            result = pindex.build_index(project_root)
            return {"status": "ok", "chunks": result["chunks"], "duration": result["duration"]}
        except ImportError as e:
            return {"status": "error", "message": f"缺少依赖: {e}，请运行: pip install sentence-transformers faiss-cpu"}
        except Exception as e:
            logger.error(f"构建索引失败: {e}")
            return {"status": "error", "message": f"构建索引失败: {str(e)}"}

    @app.post("/api/rag/refresh_index")
    async def rag_refresh_index(data: dict):
        """增量刷新 RAG 向量索引"""
        project_root = data.get("project_root", "")
        if not project_root:
            return {"status": "error", "message": "缺少 project_root 参数"}

        try:
            from rag.index import get_project_index
            pindex = get_project_index()
            result = pindex.refresh_index(project_root)
            return {
                "status": "ok",
                "chunks": result["chunks"],
                "duration": result["duration"],
                "incremental": result.get("incremental", False),
                "added_files": result.get("added_files", 0),
                "modified_files": result.get("modified_files", 0),
                "deleted_files": result.get("deleted_files", 0),
                "unchanged_files": result.get("unchanged_files", 0),
            }
        except ImportError as e:
            return {"status": "error", "message": f"缺少依赖: {e}，请运行: pip install sentence-transformers faiss-cpu"}
        except Exception as e:
            logger.error(f"刷新索引失败: {e}")
            return {"status": "error", "message": f"刷新索引失败: {str(e)}"}

    @app.post("/api/rag/search")
    async def rag_search(data: dict):
        """语义检索"""
        project_root = data.get("project_root", "")
        query = data.get("query", "")
        top_k = data.get("top_k", 5)

        if not project_root or not query:
            return {"status": "error", "message": "缺少 project_root 或 query 参数"}

        try:
            from rag.index import get_project_index
            pindex = get_project_index()
            results = pindex.search(project_root, query, top_k=top_k)
            return {"status": "ok", "results": results}
        except Exception as e:
            logger.error(f"检索失败: {e}")
            return {"status": "error", "message": f"检索失败: {str(e)}"}

    @app.get("/api/rag/index_status")
    async def rag_index_status(project_root: str = ""):
        """获取索引状态"""
        if not project_root:
            return {"indexed": False, "chunks": 0, "built_at": ""}

        try:
            from rag.index import get_project_index
            pindex = get_project_index()
            return pindex.get_index_status(project_root)
        except Exception as e:
            return {"indexed": False, "chunks": 0, "built_at": "", "error": str(e)}
