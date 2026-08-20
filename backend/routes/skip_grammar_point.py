from flask import Blueprint

from backend.utils.auth.user_context import current_user_id
from backend.utils.database.extensions import db
from backend.utils.database.models import GrammarPoint, UserGrammarProgress

bp = Blueprint("skip_grammar_point", __name__)


@bp.post("/grammar-points/<path:grammar_id>/skip")
def skip_grammar_point(grammar_id: str):
    user_id = current_user_id()

    if GrammarPoint.query.get(grammar_id) is None:
        return {"error": "Grammar point not found"}, 404

    progress = UserGrammarProgress.query.filter_by(
        user_id=user_id, grammar_id=grammar_id
    ).first()
    if progress is None:
        progress = UserGrammarProgress(user_id=user_id, grammar_id=grammar_id)
        db.session.add(progress)

    progress.status = "SKIP"
    db.session.commit()

    return {"grammar_id": grammar_id, "status": "SKIP"}, 200
