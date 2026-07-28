from flask import Blueprint, request

from backend.models import Character

bp = Blueprint("list_characters", __name__)


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


@bp.get("/characters")
def list_characters():
    try:
        limit = _parse_limit()
    except ValueError as exc:
        return {"error": str(exc)}, 400

    query = Character.query.order_by(Character.pinyin)
    if limit is not None:
        query = query.limit(limit)
    character_list = query.all()
    return [
        {
            "char": character.char,
            "pinyin": character.pinyin,
            "writting_known": character.writting_known,
            "updated_at": character.updated_at.isoformat(),
        }
        for character in character_list
    ], 200
