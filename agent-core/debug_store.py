"""
Chat 调试记录内存存储
记录每次 /api/chat 调用的完整原始数据，供调试页面展示
"""

import threading
from datetime import datetime


class ChatDebugStore:
    """Chat 请求/响应记录存储（内存，FIFO 淘汰）"""

    MAX_RECORDS = 100

    def __init__(self):
        self._records: list[dict] = []
        self._next_id: int = 0
        self._lock = threading.Lock()

    def add(self, record: dict) -> int:
        """
        追加一条记录，自动分配 id 和时间戳。
        超过 MAX_RECORDS 时淘汰最早的记录。
        返回分配的 id。
        """
        with self._lock:
            record["id"] = self._next_id
            if "timestamp" not in record:
                record["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self._records.append(record)
            self._next_id += 1

            # FIFO 淘汰
            if len(self._records) > self.MAX_RECORDS:
                self._records = self._records[-self.MAX_RECORDS:]

            return record["id"]

    def get_all(self) -> list[dict]:
        """返回全部记录"""
        with self._lock:
            return list(self._records)

    def get_since(self, since_id: int) -> list[dict]:
        """返回 id > since_id 的新记录（增量拉取）"""
        with self._lock:
            return [r for r in self._records if r["id"] > since_id]

    def clear(self):
        """清空所有记录"""
        with self._lock:
            self._records.clear()
            self._next_id = 0


# 全局单例
chat_debug_store = ChatDebugStore()
