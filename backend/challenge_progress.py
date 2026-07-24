"""Persist completed challenge task IDs alongside conversation logs."""

from __future__ import annotations

import json

from backend.challenges import is_challenge_character
from backend.conversation_logs import CONVERSATION_LOGS_DIR, VALID_CHARACTER_IDS


def _progress_file(character_id: str):
    if character_id not in VALID_CHARACTER_IDS:
        raise ValueError("Invalid character_id")
    if not is_challenge_character(character_id):
        raise ValueError("Not a challenge character")
    return CONVERSATION_LOGS_DIR / f"{character_id}.tasks.json"


def load_completed_task_ids(character_id: str) -> list[str]:
    if not is_challenge_character(character_id):
        return []

    path = _progress_file(character_id)
    if not path.is_file():
        return []

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    if not isinstance(payload, dict):
        return []

    raw_ids = payload.get("completed_task_ids", [])
    if not isinstance(raw_ids, list):
        return []

    return [
        task_id
        for task_id in raw_ids
        if isinstance(task_id, str) and task_id.strip() != ""
    ]


def save_completed_task_ids(character_id: str, completed_task_ids: list[str]) -> None:
    if not is_challenge_character(character_id):
        return

    unique_ids = list(dict.fromkeys(completed_task_ids))
    path = _progress_file(character_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"completed_task_ids": unique_ids}, ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )


def clear_completed_task_ids(character_id: str) -> None:
    if not is_challenge_character(character_id):
        return

    path = _progress_file(character_id)
    if path.is_file():
        path.unlink()
