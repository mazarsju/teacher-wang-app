from flask import Blueprint, request

from backend.routes.suggest_hsk_words import hsk_translations, serialize_word
from backend.utils.database.models import HskCharacter
from backend.utils.auth.user_context import current_user

bp = Blueprint("list_hsk_character_words", __name__)


@bp.get("/hsk-characters/<path:character>/words")
def list_hsk_character_words(character: str):
    entry = HskCharacter.query.filter_by(character=character).first()
    if entry is None:
        return {"error": "HSK character not found"}, 404

    level = request.args.get("level", type=int)
    words = entry.words
    if level is not None:
        words = [word for word in words if word.level <= level]

    words = sorted(words, key=lambda word: (word.frequency, word.word, word.pinyin))
    translations = hsk_translations([word.id for word in words], current_user().language)
    return [serialize_word(word, translations) for word in words], 200
