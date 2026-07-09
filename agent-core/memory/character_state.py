"""
人物状态快照
记录人物在各章节的状态变化
"""

import json
import logging
from typing import Optional

from memory.db import Database

logger = logging.getLogger(__name__)


class CharacterStateManager:
    """人物状态管理"""

    def __init__(self, db: Database):
        self.db = db

    def save_state(self, name: str, chapter_id: str, state: dict) -> bool:
        """保存人物在某章节的状态"""
        state_json = json.dumps(state, ensure_ascii=False)
        try:
            self.db.execute(
                """INSERT INTO character_state (name, chapter_id, state_json)
                   VALUES (?, ?, ?)
                   ON CONFLICT(name, chapter_id) DO UPDATE SET state_json=?""",
                (name, chapter_id, state_json, state_json),
            )
            self.db.conn.commit()
            return True
        except Exception as e:
            logger.error(f"保存人物状态失败: {e}")
            return False

    def get_latest_state(self, name: str) -> Optional[dict]:
        """获取人物最新状态"""
        cursor = self.db.execute(
            "SELECT * FROM character_state WHERE name=? ORDER BY chapter_id DESC LIMIT 1",
            (name,),
        )
        row = cursor.fetchone()
        if row:
            result = dict(row)
            result["state_json"] = json.loads(result["state_json"])
            return result
        return None

    def get_state_at_chapter(self, name: str, chapter_id: str) -> Optional[dict]:
        """获取人物在某章节的状态"""
        cursor = self.db.execute(
            "SELECT * FROM character_state WHERE name=? AND chapter_id<=? ORDER BY chapter_id DESC LIMIT 1",
            (name, chapter_id),
        )
        row = cursor.fetchone()
        if row:
            result = dict(row)
            result["state_json"] = json.loads(result["state_json"])
            return result
        return None

    def get_all_characters(self) -> list[str]:
        """获取所有已记录的人物名"""
        cursor = self.db.execute("SELECT DISTINCT name FROM character_state ORDER BY name")
        return [row["name"] for row in cursor.fetchall()]
