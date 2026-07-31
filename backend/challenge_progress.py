"""Persist completed challenge task IDs alongside conversation logs."""

from __future__ import annotations

import json

from backend.challenges import is_challenge_character
from backend.conversation_log_storage import get_storage, object_key
from backend.conversation_logs import VALID_CHARACTER_IDS


def progress_object_key(user_id: str, character_id: str) -> str:
    if character_id not in VALID_CHARACTER_IDS:
        raise ValueError("Invalid character_id")
    if not is_challenge_character(character_id):
        raise ValueError("Not a challenge character")
    if not isinstance(user_id, str) or user_id.strip() == "":
        raise ValueError("Invalid user_id")
    return object_key(user_id, f"{character_id}.tasks.json")


def load_completed_task_ids(user_id: str, character_id: str) -> list[str]:
    if not is_challenge_character(character_id):
        return []

    text = get_storage().read_text(progress_object_key(user_id, character_id))
    if text is None:
        return []

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
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


def save_completed_task_ids(
    user_id: str,
    character_id: str,
    completed_task_ids: list[str],
) -> None:
    if not is_challenge_character(character_id):
        return

    unique_ids = list(dict.fromkeys(completed_task_ids))
    get_storage().write_text(
        progress_object_key(user_id, character_id),
        json.dumps({"completed_task_ids": unique_ids}, ensure_ascii=False, indent=2)
        + "\n",
    )


def clear_completed_task_ids(user_id: str, character_id: str) -> None:
    if not is_challenge_character(character_id):
        return

    get_storage().delete(progress_object_key(user_id, character_id))
