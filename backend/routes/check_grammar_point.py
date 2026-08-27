from flask import Blueprint, request

from backend.utils.aiChat.chat_service import check_grammar_usage
from backend.utils.auth.user_context import current_user
from backend.utils.database.extensions import db
from backend.utils.database.models import DEFAULT_USER_PLAN, GrammarPoint, UserGrammarProgress

bp = Blueprint("check_grammar_point", __name__)

MASTERY_THRESHOLD = 3


@bp.post("/grammar-points/check")
def check_grammar_point():
    """Report which of the user's DONE grammar points a text uses. With
    check_only, this only reports usage (for detect-then-record-usage
    flows like writing practice); otherwise it also records usage inline,
    same as before check_only existed (chat's flow)."""
    user = current_user()
    body = request.get_json(silent=True) or {}
    check_only = bool(body.get("check_only", False))

    empty_response: dict = {"grammar_points_covered": []}
    if not check_only:
        empty_response["new_grammar_points_mastered"] = []

    if user.plan == DEFAULT_USER_PLAN:
        return empty_response, 200

    text = body.get("text")
    if not isinstance(text, str) or text.strip() == "":
        return {"error": "text must be a non-empty string"}, 400

    rows = (
        db.session.query(UserGrammarProgress, GrammarPoint.title)
        .join(GrammarPoint, GrammarPoint.id == UserGrammarProgress.grammar_id)
        .filter(
            UserGrammarProgress.user_id == user.shortid,
            UserGrammarProgress.status == "DONE",
        )
        .all()
    )
    if not rows:
        return empty_response, 200

    progress_by_id = {progress.grammar_id: (progress, title) for progress, title in rows}
    candidates = [
        {"id": grammar_id, "title": title}
        for grammar_id, (_, title) in progress_by_id.items()
    ]

    result = check_grammar_usage(text, candidates)

    if check_only:
        covered = [
            {"id": grammar_id, "title": progress_by_id[grammar_id][1]}
            for grammar_id in result.covered_grammar_ids
        ]
        return {"grammar_points_covered": covered}, 200

    grammar_points_covered: list[str] = []
    new_grammar_points_mastered: list[str] = []
    for grammar_id in result.covered_grammar_ids:
        progress, title = progress_by_id[grammar_id]
        grammar_points_covered.append(title)

        progress.usage_in_real_life = (progress.usage_in_real_life or 0) + 1
        if progress.usage_in_real_life >= MASTERY_THRESHOLD:
            progress.status = "MASTERED"
            new_grammar_points_mastered.append(title)

    db.session.commit()

    return {
        "grammar_points_covered": grammar_points_covered,
        "new_grammar_points_mastered": new_grammar_points_mastered,
    }, 200
