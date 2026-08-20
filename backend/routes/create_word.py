from flask import Blueprint, request

from backend.utils.knowledgeBase.character_sync import rebuild_characters_from_words, serialize_character
from backend.utils.knowledgeBase.chinese_validation import is_han_character
from backend.utils.database.extensions import db
from backend.utils.knowledgeBase.hsk_level import refresh_current_hsk_level
from backend.utils.database.models import Word, utcnow
from backend.utils.auth.user_context import current_user_id

bp = Blueprint("create_word", __name__)

WORD_MAX_LENGTH = 10
DEFINITION_MAX_LENGTH = 100
PINYIN_MAX_LENGTH = 64


class WordValidationError(ValueError):
    pass


def validate_word_payload(data: dict) -> tuple[str, str, str, bool]:
    """Validate a single word payload, returning (word, definition, pinyin, writing_known).

    Shared by the single and bulk create-word routes so both enforce
    identical rules.
    """
    if "word" not in data:
        raise WordValidationError("Missing required field: word")

    word_value = data["word"]
    definition = data.get("definition", "")
    pinyin = data.get("pinyin", "")
    writing_known = data.get("writing_known", False)

    if not isinstance(word_value, str) or not word_value.strip():
        raise WordValidationError("word must be a non-empty string")

    if len(word_value.strip()) > WORD_MAX_LENGTH:
        raise WordValidationError(
            f"word must be at most {WORD_MAX_LENGTH} characters"
        )

    if definition is not None and not isinstance(definition, str):
        raise WordValidationError("definition must be a string")

    if definition and len(definition.strip()) > DEFINITION_MAX_LENGTH:
        raise WordValidationError(
            f"definition must be at most {DEFINITION_MAX_LENGTH} characters"
        )

    if pinyin is not None and not isinstance(pinyin, str):
        raise WordValidationError("pinyin must be a string")

    if pinyin and len(pinyin.strip()) > PINYIN_MAX_LENGTH:
        raise WordValidationError(
            f"pinyin must be at most {PINYIN_MAX_LENGTH} characters"
        )

    if not isinstance(writing_known, bool):
        raise WordValidationError("writing_known must be a boolean")

    word_text = word_value.strip()
    definition_text = definition.strip() if isinstance(definition, str) else ""
    pinyin_text = pinyin.strip() if isinstance(pinyin, str) else ""

    if not any(is_han_character(character) for character in word_text):
        raise WordValidationError("word must contain at least one Chinese character")

    return word_text, definition_text, pinyin_text, writing_known


def validate_custom_fields_payload(data: dict) -> dict[str, str]:
    """Validate the optional per-word custom-field values (id -> value)."""
    custom_fields = data.get("custom_fields")
    if custom_fields is None:
        return {}
    if not isinstance(custom_fields, dict):
        raise WordValidationError("custom_fields must be an object")
    cleaned: dict[str, str] = {}
    for key, value in custom_fields.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise WordValidationError("custom_fields keys and values must be strings")
        cleaned[key] = value.strip()
    return cleaned


@bp.post("/words")
def create_word():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    try:
        word_text, definition_text, pinyin_text, writing_known = validate_word_payload(
            data
        )
        custom_fields = validate_custom_fields_payload(data)
    except WordValidationError as exc:
        return {"error": str(exc)}, 400

    user_id = current_user_id()
    if Word.query.filter_by(user_id=user_id, word=word_text).first() is not None:
        return {"error": "Word already exists"}, 409

    now = utcnow()
    word_record = Word(
        user_id=user_id,
        word=word_text,
        definition=definition_text or None,
        pinyin=pinyin_text or None,
        writing_known=writing_known,
        custom_fields=custom_fields,
        updated_at=now,
    )
    db.session.add(word_record)
    sync_result = rebuild_characters_from_words(user_id)
    db.session.commit()
    refresh_current_hsk_level(user_id)

    return {
        "word": word_record.word,
        "definition": word_record.definition,
        "pinyin": word_record.pinyin,
        "writing_known": word_record.writing_known,
        "custom_fields": word_record.custom_fields,
        "updated_at": word_record.updated_at.isoformat(),
        "characters": list(word_text),
        "updated_characters": [
            serialize_character(character)
            for character in sync_result.updated_characters
        ],
        "deleted_char_ids": sync_result.deleted_char_ids,
    }, 201
