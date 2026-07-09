"""
Markdown 结构解析器
支持 Frontmatter 解析和内容结构化
"""

import re
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """
    解析 Markdown Frontmatter
    返回 (metadata_dict, body_content)
    """
    pattern = r'^---\s*\n(.*?)\n---\s*\n(.*)$'
    match = re.match(pattern, content, re.DOTALL)

    if not match:
        return {}, content

    frontmatter_str = match.group(1)
    body = match.group(2)

    metadata = {}
    for line in frontmatter_str.strip().split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            # 处理数组格式
            if value.startswith('[') and value.endswith(']'):
                value = [v.strip().strip('"').strip("'") for v in value[1:-1].split(',') if v.strip()]

            # 处理数字
            elif value.isdigit():
                value = int(value)

            metadata[key] = value

    return metadata, body


def parse_chapter_file(filepath: str) -> Optional[dict]:
    """
    解析章节文件
    返回结构化章节信息
    """
    path = Path(filepath)
    if not path.exists():
        return None

    content = path.read_text(encoding='utf-8')
    metadata, body = parse_frontmatter(content)

    return {
        "path": filepath,
        "metadata": metadata,
        "content": body,
        "word_count": len(body),
        "headings": extract_headings(body),
    }


def extract_headings(content: str) -> list[dict]:
    """提取 Markdown 标题结构"""
    headings = []
    for match in re.finditer(r'^(#{1,6})\s+(.+)$', content, re.MULTILINE):
        level = len(match.group(1))
        title = match.group(2).strip()
        headings.append({"level": level, "title": title})
    return headings


def parse_setting_file(filepath: str) -> Optional[dict]:
    """
    解析设定文件
    提取结构化设定信息
    """
    path = Path(filepath)
    if not path.exists():
        return None

    content = path.read_text(encoding='utf-8')
    metadata, body = parse_frontmatter(content)

    return {
        "path": filepath,
        "metadata": metadata,
        "content": body,
        "sections": extract_sections(body),
    }


def extract_sections(content: str) -> list[dict]:
    """提取章节段落结构"""
    sections = []
    current_heading = None
    current_content = []

    for line in content.split('\n'):
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
        if heading_match:
            if current_heading is not None:
                sections.append({
                    "heading": current_heading,
                    "content": '\n'.join(current_content).strip()
                })
            current_heading = heading_match.group(2).strip()
            current_content = []
        else:
            current_content.append(line)

    if current_heading is not None:
        sections.append({
            "heading": current_heading,
            "content": '\n'.join(current_content).strip()
        })

    return sections
