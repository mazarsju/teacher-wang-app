"""Persist completed challenge task IDs alongside conversation logs."""

from __future__ import annotations

import json

from backend.utils.aiChat.challenges import is_challenge_character
from backend.utils.aiChat.conversation_log_storage import get_storage, object_key
from backend.utils.aiChat.conversation_logs import VALID_CHARACTER_IDS
from backend.utils.database.extensions import db
from backend.utils.database.models import ChallengeProgress


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


def mark_challenge_completed(
    user_id, challenge_scenario: str, *, commit: bool = True
) -> None:
    """Record in the DB that ``user_id`` fully completed ``challenge_scenario``."""
    if not is_challenge_character(challenge_scenario):
        return

    row = db.session.get(ChallengeProgress, (user_id, challenge_scenario))
    if row is None:
        db.session.add(
            ChallengeProgress(
                user_id=user_id, challenge_scenario=challenge_scenario, completed=True
            )
        )
    else:
        row.completed = True

    if commit:
        db.session.commit()
    else:
        db.session.flush()


def has_completed_challenge(user_id, challenge_scenario: str) -> bool:
    """Whether the DB has a completed row for ``challenge_scenario``.

    If the challenge can't be found in the database, it isn't completed.
    """
    row = db.session.get(ChallengeProgress, (user_id, challenge_scenario))
    return row is not None and bool(row.completed)


def clear_challenge_progress(
    user_id, challenge_scenario: str, *, commit: bool = True
) -> None:
    row = db.session.get(ChallengeProgress, (user_id, challenge_scenario))
    if row is None:
        return

    db.session.delete(row)
    if commit:
        db.session.commit()
    else:
        db.session.flush()
