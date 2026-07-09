"""
伏笔账本
管理伏笔的埋设、查询、兑现
"""

import logging
from typing import Optional

from memory.db import Database

logger = logging.getLogger(__name__)


class ForeshadowingLedger:
    """伏笔账本"""

    def __init__(self, db: Database):
        self.db = db

    def plant(self, fw_id: str, description: str, planted_in: str) -> bool:
        """埋设伏笔"""
        try:
            self.db.execute(
                "INSERT INTO foreshadowing (id, description, planted_in) VALUES (?, ?, ?)",
                (fw_id, description, planted_in),
            )
            self.db.conn.commit()
            logger.info(f"伏笔已埋设: {fw_id} in {planted_in}")
            return True
        except Exception as e:
            logger.error(f"埋设伏笔失败: {e}")
            return False

    def resolve(self, fw_id: str, resolved_in: str) -> bool:
        """兑现伏笔"""
        try:
            self.db.execute(
                "UPDATE foreshadowing SET status='resolved', resolved_in=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (resolved_in, fw_id),
            )
            self.db.conn.commit()
            logger.info(f"伏笔已兑现: {fw_id} in {resolved_in}")
            return True
        except Exception as e:
            logger.error(f"兑现伏笔失败: {e}")
            return False

    def get_pending(self) -> list[dict]:
        """获取所有待兑现伏笔"""
        cursor = self.db.execute(
            "SELECT * FROM foreshadowing WHERE status='pending' ORDER BY created_at"
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_by_chapter(self, chapter_id: str) -> list[dict]:
        """获取与某章节相关的所有伏笔"""
        cursor = self.db.execute(
            "SELECT * FROM foreshadowing WHERE planted_in=? OR resolved_in=? ORDER BY created_at",
            (chapter_id, chapter_id),
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_by_id(self, fw_id: str) -> Optional[dict]:
        """根据 ID 获取伏笔"""
        cursor = self.db.execute("SELECT * FROM foreshadowing WHERE id=?", (fw_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
