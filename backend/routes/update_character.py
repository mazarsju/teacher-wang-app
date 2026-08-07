from flask import Blueprint, request

from backend.extensions import db
from backend.hsk_level import refresh_current_hsk_level
from backend.models import Character, utcnow
from backend.user_context import current_user_id

bp = Blueprint("update_character", __name__)


@bp.patch("/characters/<path:char>")
def update_character(char: str):
    user_id = current_user_id()
    char_record = Character.query.filter_by(user_id=user_id, char=char).first()
    if char_record is None:
        return {"error": "Character not found"}, 404

    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if "pinyin" not in data or "writing_known" not in data:
        return {"error": "Missing required fields: pinyin, writing_known"}, 400

    pinyin = data["pinyin"]
    writing_known = data["writing_known"]

    if not isinstance(pinyin, str) or not pinyin.strip():
        return {"error": "pinyin must be a non-empty string"}, 400

    if len(pinyin.strip()) > 8:
        return {"error": "pinyin must be at most 8 characters"}, 400

    if not isinstance(writing_known, bool):
        return {"error": "writing_known must be a boolean"}, 400

    char_record.pinyin = pinyin.strip()
    char_record.writing_known = writing_known
    char_record.updated_at = utcnow()
    db.session.commit()
    refresh_current_hsk_level(user_id)

    return {
        "char": char_record.char,
        "pinyin": char_record.pinyin,
        "pinyin_readings": char_record.pinyin_readings,
        "writing_known": char_record.writing_known,
        "updated_at": char_record.updated_at.isoformat(),
    }, 200
