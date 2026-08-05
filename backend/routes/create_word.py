from flask import Blueprint, request

from backend.chinese_validation import is_han_text
from backend.extensions import db
from backend.models import Character, Word, utcnow
from backend.user_context import current_user_id

bp = Blueprint("create_word", __name__)

WORD_MAX_LENGTH = 10
DEFINITION_MAX_LENGTH = 100


class WordValidationError(ValueError):
    pass


def validate_word_payload(data: dict) -> tuple[str, str]:
    """Validate a single word payload, returning (word, definition).

    Shared by the single and bulk create-word routes so both enforce
    identical rules.
    """
    if "word" not in data:
        raise WordValidationError("Missing required field: word")

    word_value = data["word"]
    definition = data.get("definition", "")

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

    word_text = word_value.strip()
    definition_text = definition.strip() if isinstance(definition, str) else ""

    if not is_han_text(word_text):
        raise WordValidationError("word must contain only Chinese characters")

    return word_text, definition_text


@bp.post("/words")
def create_word():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    try:
        word_text, definition_text = validate_word_payload(data)
    except WordValidationError as exc:
        return {"error": str(exc)}, 400

    user_id = current_user_id()
    missing_characters = [
        character
        for character in word_text
        if Character.query.filter_by(user_id=user_id, char=character).first() is None
    ]
    if missing_characters:
        return {
            "error": (
                f"Character '{missing_characters[0]}' does not exist in the database"
            )
        }, 400

    if Word.query.filter_by(user_id=user_id, word=word_text).first() is not None:
        return {"error": "Word already exists"}, 409

    now = utcnow()
    word_record = Word(
        user_id=user_id,
        word=word_text,
        definition=definition_text or None,
        updated_at=now,
    )
    db.session.add(word_record)
    db.session.commit()

    return {
        "word": word_record.word,
        "definition": word_record.definition,
        "updated_at": word_record.updated_at.isoformat(),
        "characters": list(word_text),
    }, 201
