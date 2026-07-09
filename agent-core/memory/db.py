"""
SQLite 数据库连接管理
"""

import sqlite3
import logging
from pathlib import Path

from config import settings

logger = logging.getLogger(__name__)


class Database:
    """SQLite 数据库管理"""

    def __init__(self):
        self.conn: sqlite3.Connection | None = None
        self.db_path = settings.db_path

    def initialize(self):
        """初始化数据库连接并创建表"""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()
        logger.info(f"数据库已初始化: {self.db_path}")

    def _create_tables(self):
        """创建数据表"""
        cursor = self.conn.cursor()

        # 伏笔账本
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS foreshadowing (
                id TEXT PRIMARY KEY,
                description TEXT NOT NULL,
                planted_in TEXT NOT NULL,
                resolved_in TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 人物状态快照
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS character_state (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                chapter_id TEXT NOT NULL,
                state_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, chapter_id)
            )
        """)

        # 校验日志
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS continuity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chapter_id TEXT NOT NULL,
                warning_type TEXT NOT NULL,
                severity TEXT DEFAULT 'warning',
                message TEXT NOT NULL,
                file_path TEXT,
                line_number INTEGER,
                resolved INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        self.conn.commit()

    def close(self):
        """关闭数据库连接"""
        if self.conn:
            self.conn.close()
            logger.info("数据库连接已关闭")

    def execute(self, query: str, params: tuple = ()) -> sqlite3.Cursor:
        """执行 SQL 查询"""
        if not self.conn:
            raise RuntimeError("数据库未初始化")
        return self.conn.execute(query, params)
