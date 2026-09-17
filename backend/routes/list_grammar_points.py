from flask import Blueprint

from backend.utils.auth.user_context import current_user_id
from backend.utils.database.models import (
    GrammarPoint,
    GrammarPrerequisite,
    UserGrammarProgress,
)

bp = Blueprint("list_grammar_points", __name__)


@bp.get("/grammar-points/<int:hsk_level>")
def list_grammar_points(hsk_level):
    points = GrammarPoint.query.filter_by(hsk_level=hsk_level).all()
    point_ids = [point.id for point in points]

    prerequisites_by_grammar_id: dict[str, list[str]] = {}
    for prerequisite in GrammarPrerequisite.query.filter(
        GrammarPrerequisite.grammar_id.in_(point_ids)
    ).all():
        prerequisites_by_grammar_id.setdefault(prerequisite.grammar_id, []).append(
            prerequisite.prerequisite_id
        )

    progress_rows = (
        UserGrammarProgress.query.filter_by(user_id=current_user_id())
        .filter(UserGrammarProgress.grammar_id.in_(point_ids))
        .all()
    )
    status_by_grammar_id = {row.grammar_id: row.status for row in progress_rows}
    score_by_grammar_id = {row.grammar_id: row.score for row in progress_rows}
    usage_by_grammar_id = {
        row.grammar_id: row.usage_in_real_life for row in progress_rows
    }

    return {
        "grammar_points": [
            {
                "id": point.id,
                "prerequisites": prerequisites_by_grammar_id.get(point.id, []),
                "status": status_by_grammar_id.get(point.id, "TODO"),
                "score": (
                    int(score_by_grammar_id[point.id])
                    if score_by_grammar_id.get(point.id) is not None
                    else None
                ),
                "usage_count": usage_by_grammar_id.get(point.id) or 0,
            }
            for point in points
        ],
    }, 200
