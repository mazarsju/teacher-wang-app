from flask import Blueprint, request

from backend.extensions import db
from backend.models import Word, utcnow
from backend.user_context import current_user_id

bp = Blueprint("update_word", __name__)


@bp.patch("/words/<path:word>")
def update_word(word: str):
    word_record = Word.query.filter_by(user_id=current_user_id(), word=word).first()
    if word_record is None:
        return {"error": "Word not found"}, 404

    data = request.get_json(silent=True)
    if data is None:
        return {"error": "Invalid JSON body"}, 400

    if "definition" not in data:
        return {"error": "Missing required field: definition"}, 400

    definition = data["definition"]

    if definition is not None and not isinstance(definition, str):
        return {"error": "definition must be a string"}, 400

    if len(definition.strip()) > 100:
        return {"error": "definition must be at most 100 characters"}, 400

    word_record.definition = definition.strip() or None
    word_record.updated_at = utcnow()
    db.session.commit()

    return {
        "word": word_record.word,
        "definition": word_record.definition,
        "updated_at": word_record.updated_at.isoformat(),
    }, 200
