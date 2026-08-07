from flask import Blueprint

from backend.character_sync import rebuild_characters_from_words, serialize_character
from backend.extensions import db
from backend.hsk_level import refresh_current_hsk_level
from backend.models import Word
from backend.user_context import current_user_id

bp = Blueprint("delete_word", __name__)


@bp.delete("/words/<path:word>")
def delete_word(word: str):
    user_id = current_user_id()
    word_record = Word.query.filter_by(user_id=user_id, word=word).first()
    if word_record is None:
        return {"error": "Word not found"}, 404

    db.session.delete(word_record)
    sync_result = rebuild_characters_from_words(user_id)
    db.session.commit()
    refresh_current_hsk_level(user_id)

    return {
        "message": "Word deleted",
        "updated_characters": [
            serialize_character(character)
            for character in sync_result.updated_characters
        ],
        "deleted_char_ids": sync_result.deleted_char_ids,
    }, 200
