from flask import Blueprint

from backend.extensions import db
from backend.models import Character, IgnoreVocabCard, IgnoreWrittingCard, Word
from backend.user_context import current_user_id

bp = Blueprint("delete_knowledge_base", __name__)


@bp.delete("/database/knowledge-base")
def delete_knowledge_base():
    # Delete for a the current user, all words, all characters, all ignore words, all ignore characters
    Word.query.filter_by(user_id=current_user_id()).delete()
    Character.query.filter_by(user_id=current_user_id()).delete()
    IgnoreVocabCard.query.filter_by(user_id=current_user_id()).delete()
    IgnoreWrittingCard.query.filter_by(user_id=current_user_id()).delete()
    db.session.commit()

    return {"message": "Knowledge base deleted"}, 200
