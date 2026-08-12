from flask import Blueprint, request

from backend.utils.database.models import Word
from backend.utils.auth.user_context import current_user_id

bp = Blueprint("list_words", __name__)


def _parse_limit() -> int | None:
    raw = request.args.get("limit")
    if raw is None:
        return None
    try:
        limit = int(raw)
    except (TypeError, ValueError):
        raise ValueError("limit must be an integer") from None
    if limit < 1:
        raise ValueError("limit must be a positive integer")
    return limit


@bp.get("/words")
def list_words():
    try:
        limit = _parse_limit()
    except ValueError as exc:
        return {"error": str(exc)}, 400

    query = Word.query.filter_by(user_id=current_user_id()).order_by(Word.word)
    if limit is not None:
        query = query.limit(limit)
    word_list = query.all()
    return [
        {
            "word": word.word,
            "definition": word.definition,
            "pinyin": word.pinyin,
            "writing_known": word.writing_known,
            "updated_at": word.updated_at.isoformat(),
            "characters": list(word.word),
        }
        for word in word_list
    ], 200
