from flask import Blueprint, request

from backend.utils.knowledgeBase.hsk_word_picker import pick_next_hsk_word
from backend.utils.database.models import HskWord
from backend.utils.auth.user_context import current_user_id

bp = Blueprint("pick_hsk_word", __name__)


def _serialize_word(word: HskWord) -> dict:
    return {
        "id": word.id,
        "word": word.word,
        "level": word.level,
        "frequency": word.frequency,
        "pinyin": word.pinyin,
        "definition": word.definition,
    }


@bp.post("/hsk-words/next")
def pick_hsk_word():
    body = request.get_json(silent=True) or {}
    exclude_words = {word for word in body.get("exclude", []) if word}

    result = pick_next_hsk_word(
        current_user_id(),
        decision=body.get("decision"),
        current_index=int(body.get("current_index", 0)),
        previous_index=int(body.get("previous_index", -1)),
        increment=int(body.get("increment", 1)),
        exclude_words=exclude_words,
    )

    return {
        "word": _serialize_word(result.next_word) if result.next_word else None,
        "current_index": result.current_index,
        "previous_index": result.previous_index,
        "increment": result.increment,
        "words_between": [_serialize_word(word) for word in result.words_between],
    }, 200
