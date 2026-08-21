from datetime import datetime, timezone

from flask import Blueprint, request

from backend.utils.auth.user_context import current_user_id
from backend.utils.database.extensions import db
from backend.utils.database.models import GrammarPoint, UserGrammarProgress

bp = Blueprint("complete_grammar_point", __name__)

PASSING_SCORE = 80


@bp.post("/grammar-points/<path:grammar_id>/complete")
def complete_grammar_point(grammar_id: str):
    user_id = current_user_id()

    if GrammarPoint.query.get(grammar_id) is None:
        return {"error": "Grammar point not found"}, 404

    body = request.get_json(silent=True) or {}
    score = body.get("score")
    if not isinstance(score, int) or isinstance(score, bool) or not (0 <= score <= 100):
        return {"error": "score must be an integer between 0 and 100"}, 400

    progress = UserGrammarProgress.query.filter_by(
        user_id=user_id, grammar_id=grammar_id
    ).first()
    if progress is None:
        progress = UserGrammarProgress(user_id=user_id, grammar_id=grammar_id)
        db.session.add(progress)

    status = "DONE" if score >= PASSING_SCORE else "WIP"
    progress.status = status
    progress.score = score
    progress.last_practiced_at = datetime.now(timezone.utc)
    db.session.commit()

    return {
        "grammar_id": grammar_id,
        "status": status,
        "score": score,
        "last_practiced_at": progress.last_practiced_at.isoformat(),
    }, 200
