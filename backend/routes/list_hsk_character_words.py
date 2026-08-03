from flask import Blueprint, request

from backend.models import HskCharacter

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
    return [
        {
            "id": word.id,
            "word": word.word,
            "level": word.level,
            "frequency": word.frequency,
            "pinyin": word.pinyin,
            "definition": word.definition,
        }
        for word in words
    ], 200
