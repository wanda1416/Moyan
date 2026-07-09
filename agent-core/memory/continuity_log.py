"""
校验日志
记录一致性校验的结果
"""

import logging
from memory.db import Database

logger = logging.getLogger(__name__)


class ContinuityLog:
    """校验日志"""

    def __init__(self, db: Database):
        self.db = db

    def add_warning(self, chapter_id: str, warning_type: str, message: str,
                    severity: str = "warning", file_path: str = None,
                    line_number: int = None) -> bool:
        """记录校验警告"""
        try:
            self.db.execute(
                """INSERT INTO continuity_log
                   (chapter_id, warning_type, severity, message, file_path, line_number)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (chapter_id, warning_type, severity, message, file_path, line_number),
            )
            self.db.conn.commit()
            return True
        except Exception as e:
            logger.error(f"记录校验日志失败: {e}")
            return False

    def get_warnings(self, chapter_id: str, unresolved_only: bool = True) -> list[dict]:
        """获取章节的校验警告"""
        query = "SELECT * FROM continuity_log WHERE chapter_id=?"
        params = [chapter_id]
        if unresolved_only:
            query += " AND resolved=0"
        query += " ORDER BY created_at DESC"

        cursor = self.db.execute(query, tuple(params))
        return [dict(row) for row in cursor.fetchall()]

    def resolve_warning(self, warning_id: int) -> bool:
        """标记警告为已解决"""
        try:
            self.db.execute(
                "UPDATE continuity_log SET resolved=1 WHERE id=?",
                (warning_id,),
            )
            self.db.conn.commit()
            return True
        except Exception as e:
            logger.error(f"解决警告失败: {e}")
            return False
