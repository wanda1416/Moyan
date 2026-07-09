"""
文件系统监听 & 目录扫描
"""

import os
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class FileSystemWatcher:
    """文件系统监听器"""

    def __init__(self, root_path: str):
        self.root_path = Path(root_path)
        self._watching = False

    async def start(self):
        """开始监听"""
        self._watching = True
        logger.info(f"开始监听目录: {self.root_path}")
        # TODO: 使用 watchdog 实现文件系统监听

    async def stop(self):
        """停止监听"""
        self._watching = False
        logger.info("停止监听")

    def scan_structure(self) -> dict:
        """扫描目录结构，返回树形字典"""
        return self._build_tree(self.root_path)

    def _build_tree(self, path: Path) -> dict:
        """递归构建目录树"""
        node = {
            "name": path.name,
            "path": str(path),
            "is_dir": path.is_dir(),
        }

        if path.is_dir():
            children = []
            try:
                for entry in sorted(path.iterdir(), key=lambda p: p.name):
                    # 跳过隐藏文件和特殊目录
                    if entry.name.startswith('.') or entry.name in ('node_modules', 'target', '__pycache__'):
                        continue
                    children.append(self._build_tree(entry))
            except PermissionError:
                pass
            node["children"] = children

        return node

    @staticmethod
    def parse_file_semantics(filepath: str) -> Optional[dict]:
        """
        解析文件名的语义信息
        例: 5.1.016-第十六章 过渡.md → {volume: "5.1", chapter: 16, title: "第十六章 过渡"}
        """
        path = Path(filepath)
        name = path.stem  # 去掉 .md 后缀

        # 尝试解析层级编码
        parts = name.split("-", 1)
        if len(parts) == 2:
            code, title = parts
            code_parts = code.split(".")

            result = {"code": code, "title": title.strip(), "path": filepath}

            # 判断文件类型
            if "大纲" in title:
                result["type"] = "outline"
            elif "正文" in title:
                result["type"] = "content_dir"
            elif len(code_parts) >= 3 and code_parts[-1].isdigit():
                result["type"] = "chapter"
                result["chapter_number"] = int(code_parts[-1])
                result["volume_id"] = ".".join(code_parts[:2])
            else:
                result["type"] = "setting"

            return result

        return None
