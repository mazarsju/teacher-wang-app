from flask import Blueprint, request

from backend.chinese_validation import is_han_character
from backend.extensions import db
from backend.hsk_level import refresh_current_hsk_level
from backend.models import Character
from backend.user_context import current_user_id

bp = Blueprint("create_character", __name__)

PINYIN_MAX_LENGTH = 8


class CharacterValidationError(ValueError):
    pass


def validate_character_payload(data: dict) -> tuple[str, str, bool]:
    """Validate a single character payload, returning (char, pinyin, writing_known).

    Shared by the single and bulk create-character routes so both enforce
    identical rules.
    """
    if "char" not in data or "pinyin" not in data or "writing_known" not in data:
        raise CharacterValidationError(
            "Missing required fields: char, pinyin, writing_known"
        )

    char = data["char"]
    pinyin = data["pinyin"]
    writing_known = data["writing_known"]

    if not isinstance(char, str) or not char.strip():
        raise CharacterValidationError("char must be a non-empty string")

    if not isinstance(pinyin, str) or not pinyin.strip():
        raise CharacterValidationError("pinyin must be a non-empty string")

    if len(pinyin.strip()) > PINYIN_MAX_LENGTH:
        raise CharacterValidationError(
            f"pinyin must be at most {PINYIN_MAX_LENGTH} characters"
        )

    if not isinstance(writing_known, bool):
        raise CharacterValidationError("writing_known must be a boolean")

    char_value = char.strip()
    if not is_han_character(char_value):
        raise CharacterValidationError("char must be a single Chinese character")

    return char_value, pinyin.strip(), writing_known


@bp.post("/characters")
def create_character():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    try:
        char_value, pinyin_value, writing_known = validate_character_payload(data)
    except CharacterValidationError as exc:
        return {"error": str(exc)}, 400

    user_id = current_user_id()
    if (
        Character.query.filter_by(user_id=user_id, char=char_value).first()
        is not None
    ):
        return {"error": "Character already exists"}, 409

    char_record = Character(
        user_id=user_id,
        char=char_value,
        pinyin=pinyin_value,
        writing_known=writing_known,
    )
    db.session.add(char_record)
    db.session.commit()
    refresh_current_hsk_level(user_id)

    return {
        "char": char_record.char,
        "pinyin": char_record.pinyin,
        "pinyin_readings": char_record.pinyin_readings,
        "writing_known": char_record.writing_known,
        "updated_at": char_record.updated_at.isoformat(),
    }, 201
