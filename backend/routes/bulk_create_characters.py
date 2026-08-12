from flask import Blueprint, request

from backend.utils.database.extensions import db
from backend.utils.knowledgeBase.hsk_level import refresh_current_hsk_level
from backend.utils.database.models import Character
from backend.routes.create_character import (
    CharacterValidationError,
    validate_character_payload,
)
from backend.utils.auth.user_context import current_user_id

bp = Blueprint("bulk_create_characters", __name__)

MAX_BULK_SIZE = 100


@bp.post("/characters/bulk-create")
def bulk_create_characters():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("characters"), list):
        return {"error": "Invalid JSON body: expected a 'characters' list"}, 400

    items = data["characters"]
    if not items:
        return {"error": "characters must be a non-empty list"}, 400
    if len(items) > MAX_BULK_SIZE:
        return {
            "error": f"Cannot create more than {MAX_BULK_SIZE} characters at once"
        }, 400

    parsed: list[tuple[str, str, bool]] = []
    seen_chars: set[str] = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            return {"error": f"Item {index} must be an object"}, 400

        try:
            char_value, pinyin_value, writing_known = validate_character_payload(item)
        except CharacterValidationError as exc:
            return {"error": f"Item {index}: {exc}"}, 400

        if char_value in seen_chars:
            return {
                "error": (
                    f"Item {index}: character '{char_value}' is duplicated in "
                    "the request"
                )
            }, 400
        seen_chars.add(char_value)
        parsed.append((char_value, pinyin_value, writing_known))

    user_id = current_user_id()

    existing_characters = {
        row.char
        for row in Character.query.filter_by(user_id=user_id)
        .filter(Character.char.in_(seen_chars))
        .all()
    }
    if existing_characters:
        return {
            "error": f"Character '{sorted(existing_characters)[0]}' already exists"
        }, 409

    created_records = []
    for char_value, pinyin_value, writing_known in parsed:
        char_record = Character(
            user_id=user_id,
            char=char_value,
            pinyin=pinyin_value,
            writing_known=writing_known,
        )
        db.session.add(char_record)
        created_records.append(char_record)
    db.session.commit()
    refresh_current_hsk_level(user_id)

    return {
        "characters": [
            {
                "char": record.char,
                "pinyin": record.pinyin,
                "pinyin_readings": record.pinyin_readings,
                "writing_known": record.writing_known,
                "updated_at": record.updated_at.isoformat(),
            }
            for record in created_records
        ]
    }, 201
