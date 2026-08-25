from flask import Blueprint, request

from backend.utils.aiChat.chat_service import check_grammar_usage
from backend.utils.auth.user_context import current_user
from backend.utils.database.extensions import db
from backend.utils.database.models import DEFAULT_USER_PLAN, GrammarPoint, UserGrammarProgress

bp = Blueprint("check_grammar_point", __name__)

MASTERY_THRESHOLD = 3


@bp.post("/grammar-points/check")
def check_grammar_point():
    user = current_user()

    if user.plan == DEFAULT_USER_PLAN:
        return {"grammar_points_covered": [], "new_grammar_points_mastered": []}, 200

    body = request.get_json(silent=True) or {}
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
        return {"grammar_points_covered": [], "new_grammar_points_mastered": []}, 200

    progress_by_id = {progress.grammar_id: (progress, title) for progress, title in rows}
    candidates = [
        {"id": grammar_id, "title": title}
        for grammar_id, (_, title) in progress_by_id.items()
    ]

    result = check_grammar_usage(text, candidates)

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
