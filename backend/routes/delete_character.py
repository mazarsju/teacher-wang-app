from flask import Blueprint

from backend.extensions import db
from backend.hsk_level import refresh_current_hsk_level
from backend.models import Character
from backend.user_context import current_user_id

bp = Blueprint("delete_character", __name__)


@bp.delete("/characters/<path:char>")
def delete_character(char: str):
    user_id = current_user_id()
    char_record = Character.query.filter_by(user_id=user_id, char=char).first()
    if char_record is None:
        return {"error": "Character not found"}, 404

    char_record.words.clear()
    db.session.delete(char_record)
    db.session.commit()
    refresh_current_hsk_level(user_id)

    return {"message": "Character deleted"}, 200
