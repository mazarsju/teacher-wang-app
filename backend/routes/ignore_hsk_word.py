from flask import Blueprint, request

from backend.utils.database.extensions import db
from backend.utils.knowledgeBase.hsk_word_picker import suggested_hsk_words
from backend.utils.database.models import IgnoreHskWord
from backend.routes.suggest_hsk_words import (
    SUGGESTION_LIMIT,
    hsk_translations,
    serialize_word,
)
from backend.utils.auth.user_context import current_user, current_user_id

bp = Blueprint("ignore_hsk_word", __name__)


@bp.post("/hsk-words/ignore")
def ignore_hsk_word():
    user_id = current_user_id()
    writings = {
        word.strip()
        for word in (request.get_json(silent=True) or {}).get("words", [])
        if isinstance(word, str) and word.strip()
    }
    if not writings:
        return {"error": "words is required"}, 400

    already_ignored = {
        row.writing
        for row in IgnoreHskWord.query.filter_by(user_id=user_id)
        .filter(IgnoreHskWord.writing.in_(writings))
        .all()
    }
    new_writings = writings - already_ignored
    if new_writings:
        db.session.add_all(
            IgnoreHskWord(user_id=user_id, writing=writing) for writing in new_writings
        )
        db.session.commit()

    words = suggested_hsk_words(user_id, limit=SUGGESTION_LIMIT)
    translations = hsk_translations([word.id for word in words], current_user().language)
    return {"words": [serialize_word(word, translations) for word in words]}, 200
