from flask import Blueprint, request

from backend.extensions import db
from backend.hsk_level import refresh_current_hsk_level
from backend.models import Character, utcnow

bp = Blueprint("update_character", __name__)


@bp.patch("/characters/<path:char>")
def update_character(char: str):
    char_record = Character.query.filter_by(char=char).first()
    if char_record is None:
        return {"error": "Character not found"}, 404

    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if "pinyin" not in data or "writting_known" not in data:
        return {"error": "Missing required fields: pinyin, writting_known"}, 400

    pinyin = data["pinyin"]
    writting_known = data["writting_known"]

    if not isinstance(pinyin, str) or not pinyin.strip():
        return {"error": "pinyin must be a non-empty string"}, 400

    if len(pinyin.strip()) > 8:
        return {"error": "pinyin must be at most 8 characters"}, 400

    if not isinstance(writting_known, bool):
        return {"error": "writting_known must be a boolean"}, 400

    char_record.pinyin = pinyin.strip()
    char_record.writting_known = writting_known
    char_record.updated_at = utcnow()
    db.session.commit()
    refresh_current_hsk_level()

    return {
        "char": char_record.char,
        "pinyin": char_record.pinyin,
        "writting_known": char_record.writting_known,
        "updated_at": char_record.updated_at.isoformat(),
    }, 200
