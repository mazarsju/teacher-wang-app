from flask import Blueprint, request

from backend.hsk_word_picker import pick_next_hsk_word
from backend.user_context import current_user_id

bp = Blueprint("pick_hsk_word", __name__)


@bp.get("/hsk-words/next")
def pick_hsk_word():
    exclude_param = request.args.get("exclude", "")
    exclude_words = {word for word in exclude_param.split(",") if word}

    word = pick_next_hsk_word(current_user_id(), exclude_words)
    if word is None:
        return {"word": None}, 200

    return {
        "word": {
            "id": word.id,
            "word": word.word,
            "level": word.level,
            "frequency": word.frequency,
            "pinyin": word.pinyin,
            "definition": word.definition,
            "characters": [character.character for character in word.characters],
        }
    }, 200
