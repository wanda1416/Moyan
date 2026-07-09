"""
语义检索 & 关联推荐
根据当前文件/章节，检索关联的设定、大纲、前后章等
"""

import logging
from pathlib import Path
from typing import Optional

from core.parser import parse_chapter_file, parse_frontmatter

logger = logging.getLogger(__name__)


class Retriever:
    """语义检索引擎 (初期基于规则匹配)"""

    def __init__(self, project_state):
        self.project_state = project_state

    def get_related_files(self, file_path: str) -> list[dict]:
        """
        获取与当前文件关联的文件列表
        """
        related = []

        # 解析当前文件信息
        file_info = self._parse_file_info(file_path)
        if not file_info:
            return related

        # 1. 查找同卷大纲
        outline = self._find_outline(file_info)
        if outline:
            related.append({"type": "outline", "path": outline, "label": "所属卷大纲"})

        # 2. 查找前一章
        prev_chapter = self._find_adjacent_chapter(file_info, offset=-1)
        if prev_chapter:
            related.append({"type": "prev_chapter", "path": prev_chapter, "label": "前一章"})

        # 3. 查找后一章
        next_chapter = self._find_adjacent_chapter(file_info, offset=1)
        if next_chapter:
            related.append({"type": "next_chapter", "path": next_chapter, "label": "后一章"})

        # 4. 关键词匹配设定文件
        setting_files = self._find_related_settings(file_info)
        for sf in setting_files:
            related.append({"type": "setting", "path": sf["path"], "label": sf["label"]})

        return related

    def _parse_file_info(self, file_path: str) -> Optional[dict]:
        """解析文件路径中的语义信息"""
        path = Path(file_path)
        name = path.stem
        parts = name.split("-", 1)

        if len(parts) < 2:
            return None

        code, title = parts
        code_parts = code.split(".")

        return {
            "code": code,
            "title": title,
            "code_parts": code_parts,
            "volume_id": ".".join(code_parts[:2]) if len(code_parts) >= 2 else None,
            "chapter_number": int(code_parts[-1]) if code_parts[-1].isdigit() else None,
        }

    def _find_outline(self, file_info: dict) -> Optional[str]:
        """查找同卷大纲文件"""
        volume_id = file_info.get("volume_id")
        if not volume_id:
            return None

        for path, info in self.project_state.file_index.items():
            if info.get("type") == "outline" and volume_id in path:
                return path
        return None

    def _find_adjacent_chapter(self, file_info: dict, offset: int) -> Optional[str]:
        """查找相邻章节"""
        chapter_number = file_info.get("chapter_number")
        volume_id = file_info.get("volume_id")
        if chapter_number is None or not volume_id:
            return None

        target_number = chapter_number + offset
        for path, info in self.project_state.file_index.items():
            if (info.get("type") == "chapter"
                    and info.get("volume_id") == volume_id
                    and info.get("chapter_number") == target_number):
                return path
        return None

    def _find_related_settings(self, file_info: dict) -> list[dict]:
        """根据关键词查找关联设定文件"""
        # TODO: 基于章节内容提取关键词，匹配设定文件
        results = []
        title = file_info.get("title", "")

        for path, info in self.project_state.file_index.items():
            if info.get("type") == "setting":
                # 简单的名称匹配
                setting_name = Path(path).stem
                if setting_name in title or any(kw in title for kw in setting_name.split("-")):
                    results.append({"path": path, "label": setting_name})

        return results[:5]  # 最多返回5个
