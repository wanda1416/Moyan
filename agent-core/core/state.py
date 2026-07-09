"""
项目状态管理
维护文件索引、当前打开的文件等信息
"""

import logging
from pathlib import Path
from typing import Optional

from core.filesystem import FileSystemWatcher
from core.parser import parse_frontmatter

logger = logging.getLogger(__name__)


class ProjectState:
    """项目状态"""

    def __init__(self):
        self.root_path: Optional[str] = None
        self.file_index: dict[str, dict] = {}
        self.is_indexed: bool = False
        self.current_file: Optional[str] = None
        self._watcher: Optional[FileSystemWatcher] = None

    async def scan_directory(self, root_path: str):
        """扫描项目目录，建立索引"""
        self.root_path = root_path
        self.file_index.clear()
        self._watcher = FileSystemWatcher(root_path)

        # 递归扫描所有 Markdown 文件
        root = Path(root_path)
        for md_file in root.rglob("*.md"):
            # 跳过隐藏目录
            if any(part.startswith('.') for part in md_file.parts):
                continue

            file_info = self._index_file(str(md_file))
            if file_info:
                self.file_index[str(md_file)] = file_info

        self.is_indexed = True
        logger.info(f"项目索引建立完成: {len(self.file_index)} 个文件")

    def _index_file(self, filepath: str) -> Optional[dict]:
        """索引单个文件"""
        path = Path(filepath)
        name = path.stem
        parts = name.split("-", 1)

        if len(parts) < 2:
            return {"type": "unknown", "path": filepath}

        code, title = parts
        code_parts = code.split(".")

        info = {
            "code": code,
            "title": title.strip(),
            "path": filepath,
        }

        # 判断文件类型
        if "大纲" in title:
            info["type"] = "outline"
        elif "设定" in title or "基础设定" in str(filepath):
            info["type"] = "setting"
        elif len(code_parts) >= 3 and code_parts[-1].isdigit():
            info["type"] = "chapter"
            info["chapter_number"] = int(code_parts[-1])
            info["volume_id"] = ".".join(code_parts[:2])

            # 尝试解析 frontmatter
            try:
                content = path.read_text(encoding='utf-8')
                metadata, _ = parse_frontmatter(content)
                info["metadata"] = metadata
            except Exception:
                pass
        else:
            info["type"] = "setting"

        return info

    def get_file_info(self, filepath: str) -> Optional[dict]:
        """获取文件索引信息"""
        return self.file_index.get(filepath)

    def get_chapters_by_volume(self, volume_id: str) -> list[dict]:
        """获取指定卷的所有章节"""
        return [
            info for info in self.file_index.values()
            if info.get("type") == "chapter" and info.get("volume_id") == volume_id
        ]

    def get_all_settings(self) -> list[dict]:
        """获取所有设定文件"""
        return [
            info for info in self.file_index.values()
            if info.get("type") == "setting"
        ]
