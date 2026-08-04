from flask import Blueprint

from backend.extensions import db
from backend.models import Character, IgnoreVocabCard, IgnoreWrittingCard, Word

bp = Blueprint("delete_knowledge_base", __name__)


@bp.delete("/database/knowledge-base")
def delete_knowledge_base():
    # Delete all words, all characters, all ignore words, all ignore characters
    Word.query.delete()
    Character.query.delete()
    IgnoreVocabCard.query.delete()
    IgnoreWrittingCard.query.delete()
    db.session.commit()

    return {"message": "Knowledge base deleted"}, 200
