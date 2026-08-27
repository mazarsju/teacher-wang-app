from flask import Blueprint, request

from backend.utils.aiChat.chat_service import check_grammar_usage
from backend.utils.auth.user_context import current_user
from backend.utils.database.extensions import db
from backend.utils.database.models import DEFAULT_USER_PLAN, GrammarPoint, UserGrammarProgress

bp = Blueprint("detect_grammar_points", __name__)


@bp.post("/grammar-points/detect")
def detect_grammar_points():
    """Report which of the user's mastered-in-progress grammar points a text
    uses, without recording any usage. Pairs with POST /grammar-points/record-usage,
    called once the caller decides the usage should actually count (e.g. once
    a whole piece of writing is fully correct, not sentence by sentence)."""
    user = current_user()

    if user.plan == DEFAULT_USER_PLAN:
        return {"grammar_points_covered": []}, 200

    body = request.get_json(silent=True) or {}
    text = body.get("text")
    if not isinstance(text, str) or text.strip() == "":
        return {"error": "text must be a non-empty string"}, 400

    rows = (
        db.session.query(UserGrammarProgress.grammar_id, GrammarPoint.title)
        .join(GrammarPoint, GrammarPoint.id == UserGrammarProgress.grammar_id)
        .filter(
            UserGrammarProgress.user_id == user.shortid,
            UserGrammarProgress.status == "DONE",
        )
        .all()
    )
    if not rows:
        return {"grammar_points_covered": []}, 200

    title_by_id = {grammar_id: title for grammar_id, title in rows}
    candidates = [{"id": grammar_id, "title": title} for grammar_id, title in title_by_id.items()]

    result = check_grammar_usage(text, candidates)

    return {
        "grammar_points_covered": [
            {"id": grammar_id, "title": title_by_id[grammar_id]}
            for grammar_id in result.covered_grammar_ids
        ]
    }, 200
