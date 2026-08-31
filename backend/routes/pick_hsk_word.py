from flask import Blueprint, request

from backend.routes.suggest_hsk_words import hsk_translations, serialize_word
from backend.utils.knowledgeBase.hsk_word_picker import pick_next_hsk_word
from backend.utils.auth.user_context import current_user, current_user_id

bp = Blueprint("pick_hsk_word", __name__)


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

    words_to_translate = list(result.words_between)
    if result.next_word is not None:
        words_to_translate.append(result.next_word)
    translations = hsk_translations(
        [word.id for word in words_to_translate], current_user().language
    )

    return {
        "word": serialize_word(result.next_word, translations) if result.next_word else None,
        "current_index": result.current_index,
        "previous_index": result.previous_index,
        "increment": result.increment,
        "words_between": [
            serialize_word(word, translations) for word in result.words_between
        ],
    }, 200
