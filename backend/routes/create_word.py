from flask import Blueprint, request

from backend.chinese_validation import is_han_text
from backend.extensions import db
from backend.models import Character, Word, utcnow
from backend.user_context import current_user_id

bp = Blueprint("create_word", __name__)


@bp.post("/words")
def create_word():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if "word" not in data:
        return {"error": "Missing required field: word"}, 400

    word_value = data["word"]
    definition = data.get("definition", "")

    if not isinstance(word_value, str) or not word_value.strip():
        return {"error": "word must be a non-empty string"}, 400

    if len(word_value.strip()) > 10:
        return {"error": "word must be at most 10 characters"}, 400

    if definition is not None and not isinstance(definition, str):
        return {"error": "definition must be a string"}, 400

    if len(definition.strip()) > 100:
        return {"error": "definition must be at most 100 characters"}, 400

    word_text = word_value.strip()
    definition_text = definition.strip() if isinstance(definition, str) else ""

    if not is_han_text(word_text):
        return {"error": "word must contain only Chinese characters"}, 400

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

    word_record = Word(
        user_id=user_id,
        word=word_text,
        definition=definition_text or None,
    )
    db.session.add(word_record)

    now = utcnow()
    for character in word_text:
        char_record = Character.query.filter_by(
            user_id=user_id,
            char=character,
        ).first()
        if char_record is None:
            continue

        if word_record not in char_record.words:
            char_record.words.append(word_record)
            char_record.updated_at = now

    word_record.updated_at = now
    db.session.commit()

    return {
        "word": word_record.word,
        "definition": word_record.definition,
        "updated_at": word_record.updated_at.isoformat(),
        "characters": [character for character in word_text],
    }, 201
