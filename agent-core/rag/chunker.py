"""
Markdown 分块器
按标题层级切分文档，保留结构语义
"""

import re
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# 分块参数
MAX_CHUNK_SIZE = 1000   # 单块最大字符数
OVERLAP_SIZE = 200      # 二次切分时的重叠字符数


@dataclass
class Chunk:
    """文档片段"""
    chunk_id: str           # 唯一标识（序号）
    text: str               # 片段文本
    source_path: str        # 来源文件路径
    heading: str = ""       # 所属标题（最近的上级标题）


def chunk_markdown(content: str, source_path: str) -> list[Chunk]:
    """
    将 Markdown 内容按标题层级切分为语义片段

    策略：
    1. 按 # / ## / ### 标题行切分，每个标题下的内容块作为一个 chunk
    2. 超长块（>MAX_CHUNK_SIZE）按段落二次切分，保留 OVERLAP_SIZE 重叠
    3. 无标题的开头内容也作为一个 chunk
    """
    chunks: list[Chunk] = []
    chunk_counter = 0

    # 按标题行拆分
    sections = _split_by_headings(content)

    for heading, body in sections:
        body = body.strip()
        if not body:
            continue

        # 短内容直接作为一个 chunk
        if len(body) <= MAX_CHUNK_SIZE:
            chunk_counter += 1
            chunks.append(Chunk(
                chunk_id=f"{source_path}#{chunk_counter}",
                text=body,
                source_path=source_path,
                heading=heading,
            ))
        else:
            # 超长内容按段落二次切分
            sub_parts = _split_by_paragraphs(body, max_size=MAX_CHUNK_SIZE, overlap=OVERLAP_SIZE)
            for part in sub_parts:
                part = part.strip()
                if not part:
                    continue
                chunk_counter += 1
                chunks.append(Chunk(
                    chunk_id=f"{source_path}#{chunk_counter}",
                    text=part,
                    source_path=source_path,
                    heading=heading,
                ))

    return chunks


def _split_by_headings(content: str) -> list[tuple[str, str]]:
    """
    按 Markdown 标题行拆分内容
    返回 [(heading, body), ...] 列表
    heading 为空字符串表示标题前的内容
    """
    # 匹配 # / ## / ### / #### 标题行
    heading_pattern = re.compile(r'^(#{1,4})\s+(.+)$', re.MULTILINE)

    sections: list[tuple[str, str]] = []
    last_end = 0
    current_heading = ""

    for match in heading_pattern.finditer(content):
        # 标题行之前的内容归入上一个 section
        if match.start() > last_end:
            sections.append((current_heading, content[last_end:match.start()]))

        current_heading = match.group(2).strip()
        last_end = match.end()

    # 最后一段
    if last_end < len(content):
        sections.append((current_heading, content[last_end:]))

    # 如果没有找到任何标题，整段作为一个 section
    if not sections:
        sections.append(("", content))

    return sections


def _split_by_paragraphs(text: str, max_size: int = MAX_CHUNK_SIZE, overlap: int = OVERLAP_SIZE) -> list[str]:
    """
    按段落切分超长文本，相邻块保留重叠
    """
    paragraphs = text.split('\n\n')
    parts: list[str] = []
    current_parts: list[str] = []
    current_len = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        para_len = len(para) + 2  # +2 for \n\n

        if current_len + para_len > max_size and current_parts:
            # 当前块已满，保存并开启新块
            parts.append('\n\n'.join(current_parts))

            # 保留重叠：从末尾往前找
            overlap_parts: list[str] = []
            overlap_len = 0
            for p in reversed(current_parts):
                if overlap_len + len(p) + 2 > overlap:
                    break
                overlap_parts.insert(0, p)
                overlap_len += len(p) + 2

            current_parts = overlap_parts + [para]
            current_len = overlap_len + para_len
        else:
            current_parts.append(para)
            current_len += para_len

    # 最后一块
    if current_parts:
        parts.append('\n\n'.join(current_parts))

    return parts
