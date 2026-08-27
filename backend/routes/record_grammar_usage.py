from flask import Blueprint, request

from backend.utils.auth.user_context import current_user
from backend.utils.database.extensions import db
from backend.utils.database.models import DEFAULT_USER_PLAN, UserGrammarProgress

bp = Blueprint("record_grammar_usage", __name__)

MASTERY_THRESHOLD = 3


@bp.post("/grammar-points/record-usage")
def record_grammar_usage():
    """Apply usages detected by POST /grammar-points/check with
    check_only: true. ``grammar_ids`` has one entry per usage (a grammar
    point used in 3 sentences appears 3 times), matching how
    POST /grammar-points/check increments per call."""
    user = current_user()

    if user.plan == DEFAULT_USER_PLAN:
        return {"new_grammar_points_mastered": []}, 200

    body = request.get_json(silent=True) or {}
    grammar_ids = body.get("grammar_ids")
    if not isinstance(grammar_ids, list) or not all(isinstance(g, str) for g in grammar_ids):
        return {"error": "grammar_ids must be a list of strings"}, 400

    if not grammar_ids:
        return {"new_grammar_points_mastered": []}, 200

    progress_rows = UserGrammarProgress.query.filter(
        UserGrammarProgress.user_id == user.shortid,
        UserGrammarProgress.grammar_id.in_(set(grammar_ids)),
    ).all()
    progress_by_id = {progress.grammar_id: progress for progress in progress_rows}

    new_grammar_points_mastered: list[str] = []
    for grammar_id in grammar_ids:
        progress = progress_by_id.get(grammar_id)
        if progress is None or progress.status != "DONE":
            continue
        progress.usage_in_real_life = (progress.usage_in_real_life or 0) + 1
        if progress.usage_in_real_life >= MASTERY_THRESHOLD:
            progress.status = "MASTERED"
            new_grammar_points_mastered.append(grammar_id)

    db.session.commit()

    return {"new_grammar_points_mastered": new_grammar_points_mastered}, 200
