from flask import Blueprint

from backend.utils.knowledgeBase.hsk_word_picker import suggested_hsk_words
from backend.utils.database.models import HskWord
from backend.utils.auth.user_context import current_user_id

bp = Blueprint("suggest_hsk_words", __name__)

SUGGESTION_LIMIT = 10


def serialize_word(word: HskWord) -> dict:
    return {
        "id": word.id,
        "word": word.word,
        "level": word.level,
        "frequency": word.frequency,
        "pinyin": word.pinyin,
        "definition": word.definition,
    }


@bp.get("/hsk-words/suggestions")
def get_hsk_word_suggestions():
    words = suggested_hsk_words(current_user_id(), limit=SUGGESTION_LIMIT)
    return {"words": [serialize_word(word) for word in words]}, 200
