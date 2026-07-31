from flask import Blueprint

from backend.extensions import db
from backend.models import Word
from backend.user_context import current_user_id

bp = Blueprint("delete_word", __name__)


@bp.delete("/words/<path:word>")
def delete_word(word: str):
    word_record = Word.query.filter_by(user_id=current_user_id(), word=word).first()
    if word_record is None:
        return {"error": "Word not found"}, 404

    word_record.characters.clear()
    db.session.delete(word_record)
    db.session.commit()

    return {"message": "Word deleted"}, 200
