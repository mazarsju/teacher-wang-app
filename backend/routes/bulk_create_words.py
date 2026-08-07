from flask import Blueprint, request

from backend.character_sync import rebuild_characters_from_words
from backend.extensions import db
from backend.hsk_level import refresh_current_hsk_level
from backend.models import Word, utcnow
from backend.routes.create_word import WordValidationError, validate_word_payload
from backend.user_context import current_user_id

bp = Blueprint("bulk_create_words", __name__)

MAX_BULK_SIZE = 100


@bp.post("/words/bulk-create")
def bulk_create_words():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("words"), list):
        return {"error": "Invalid JSON body: expected a 'words' list"}, 400

    items = data["words"]
    if not items:
        return {"error": "words must be a non-empty list"}, 400
    if len(items) > MAX_BULK_SIZE:
        return {"error": f"Cannot create more than {MAX_BULK_SIZE} words at once"}, 400

    parsed: list[tuple[str, str, str, bool]] = []
    seen_words: set[str] = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            return {"error": f"Item {index} must be an object"}, 400

        try:
            word_text, definition_text, pinyin_text, writting_known = (
                validate_word_payload(item)
            )
        except WordValidationError as exc:
            return {"error": f"Item {index}: {exc}"}, 400

        if word_text in seen_words:
            return {
                "error": f"Item {index}: word '{word_text}' is duplicated in the request"
            }, 400
        seen_words.add(word_text)
        parsed.append((word_text, definition_text, pinyin_text, writting_known))

    user_id = current_user_id()

    existing_words = {
        row.word
        for row in Word.query.filter_by(user_id=user_id)
        .filter(Word.word.in_(seen_words))
        .all()
    }
    if existing_words:
        return {"error": f"Word '{sorted(existing_words)[0]}' already exists"}, 409

    now = utcnow()
    created_records = []
    for word_text, definition_text, pinyin_text, writting_known in parsed:
        word_record = Word(
            user_id=user_id,
            word=word_text,
            definition=definition_text or None,
            pinyin=pinyin_text or None,
            writting_known=writting_known,
            updated_at=now,
        )
        db.session.add(word_record)
        created_records.append(word_record)

    rebuild_characters_from_words(user_id)
    db.session.commit()
    refresh_current_hsk_level(user_id)

    return {
        "words": [
            {
                "word": record.word,
                "definition": record.definition,
                "pinyin": record.pinyin,
                "writting_known": record.writting_known,
                "updated_at": record.updated_at.isoformat(),
                "characters": list(record.word),
            }
            for record in created_records
        ]
    }, 201
