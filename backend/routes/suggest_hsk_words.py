from flask import Blueprint

from backend.utils.knowledgeBase.hsk_word_picker import suggested_hsk_words
from backend.utils.database.models import HskWord, HskWordTranslation
from backend.utils.auth.user_context import current_user, current_user_id

bp = Blueprint("suggest_hsk_words", __name__)

SUGGESTION_LIMIT = 10


def hsk_translations(word_ids: list[str], language: str) -> dict[str, str]:
    """``hsk_word_id`` -> translated definition, for a non-English ``language``.

    English never has rows here (``upload_hsk_translation`` writes English
    text straight to ``hsk_words.definition``), so skip the query entirely
    for "en" — the caller's ``translations.get(...)`` fallback already
    resolves to ``word.definition`` with an empty dict.
    """
    if language == "en" or not word_ids:
        return {}
    rows = HskWordTranslation.query.filter(
        HskWordTranslation.hsk_word_id.in_(word_ids),
        HskWordTranslation.language == language,
    ).all()
    return {row.hsk_word_id: row.translate for row in rows}


def serialize_word(word: HskWord, translations: dict[str, str] | None = None) -> dict:
    translations = translations or {}
    return {
        "id": word.id,
        "word": word.word,
        "level": word.level,
        "frequency": word.frequency,
        "pinyin": word.pinyin,
        "definition": translations.get(word.id, word.definition),
    }


@bp.get("/hsk-words/suggestions")
def get_hsk_word_suggestions():
    words = suggested_hsk_words(current_user_id(), limit=SUGGESTION_LIMIT)
    translations = hsk_translations([word.id for word in words], current_user().language)
    return {"words": [serialize_word(word, translations) for word in words]}, 200
