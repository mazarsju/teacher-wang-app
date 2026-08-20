from flask import Blueprint, request

from backend.utils.knowledgeBase.character_sync import rebuild_characters_from_words, serialize_character
from backend.utils.database.extensions import db
from backend.utils.knowledgeBase.hsk_level import refresh_current_hsk_level
from backend.utils.database.models import Word, utcnow
from backend.routes.create_word import WordValidationError, validate_custom_fields_payload
from backend.utils.auth.user_context import current_user_id

bp = Blueprint("update_word", __name__)


@bp.patch("/words/<path:word>")
def update_word(word: str):
    user_id = current_user_id()
    word_record = Word.query.filter_by(user_id=user_id, word=word).first()
    if word_record is None:
        return {"error": "Word not found"}, 404

    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if "definition" not in data:
        return {"error": "Missing required field: definition"}, 400

    definition = data["definition"]

    if definition is not None and not isinstance(definition, str):
        return {"error": "definition must be a string"}, 400

    if len(definition.strip()) > 100:
        return {"error": "definition must be at most 100 characters"}, 400

    if "pinyin" in data:
        pinyin = data["pinyin"]
        if pinyin is not None and not isinstance(pinyin, str):
            return {"error": "pinyin must be a string"}, 400
        if pinyin and len(pinyin.strip()) > 64:
            return {"error": "pinyin must be at most 64 characters"}, 400
        word_record.pinyin = pinyin.strip() or None if isinstance(pinyin, str) else None

    if "writing_known" in data:
        writing_known = data["writing_known"]
        if not isinstance(writing_known, bool):
            return {"error": "writing_known must be a boolean"}, 400
        word_record.writing_known = writing_known

    if "custom_fields" in data:
        try:
            word_record.custom_fields = validate_custom_fields_payload(data)
        except WordValidationError as exc:
            return {"error": str(exc)}, 400

    word_record.definition = definition.strip() or None
    word_record.updated_at = utcnow()
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
        "characters": list(word_record.word),
        "updated_characters": [
            serialize_character(character)
            for character in sync_result.updated_characters
        ],
        "deleted_char_ids": sync_result.deleted_char_ids,
    }, 200

