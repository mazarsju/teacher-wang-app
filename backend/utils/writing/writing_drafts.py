"""Writing-practice draft storage, in the same S3 bucket as conversation logs."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from backend.utils.aiChat.conversation_log_storage import get_storage, object_key

EMPTY_DRAFT: dict = {"draft": "", "archive": []}


def _is_valid_topic_id(topic_id: str) -> bool:
    return bool(topic_id) and all(char.isalnum() or char == "-" for char in topic_id)


def draft_object_key(user_id: str, topic_id: str) -> str:
    if not _is_valid_topic_id(topic_id):
        raise ValueError("Invalid topic_id")
    return object_key(user_id, f"writing/{topic_id}.json")


def load_draft(user_id: str, topic_id: str) -> dict:
    text = get_storage().read_text(draft_object_key(user_id, topic_id))
    if text is None:
        return dict(EMPTY_DRAFT)

    try:
        data = json.loads(text)
    except ValueError:
        return dict(EMPTY_DRAFT)
    if not isinstance(data, dict):
        return dict(EMPTY_DRAFT)

    draft = data.get("draft")
    archive = data.get("archive")
    return {
        "draft": draft if isinstance(draft, str) else "",
        "archive": archive if isinstance(archive, list) else [],
    }


def save_draft(user_id: str, topic_id: str, draft: str) -> dict:
    # archive is managed separately later; preserve whatever is already there.
    existing = load_draft(user_id, topic_id)
    payload = {"draft": draft, "archive": existing["archive"]}
    get_storage().write_text(draft_object_key(user_id, topic_id), json.dumps(payload))
    return payload


def complete_draft(user_id: str, topic_id: str, text: str) -> dict:
    """Save a fully-corrected text and append it to the revision archive."""
    existing = load_draft(user_id, topic_id)
    entry = {"timestamp": datetime.now(timezone.utc).isoformat(), "content": text}
    payload = {"draft": text, "archive": existing["archive"] + [entry]}
    get_storage().write_text(draft_object_key(user_id, topic_id), json.dumps(payload))
    return payload
