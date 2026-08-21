from flask import Blueprint

from backend.utils.auth.user_context import current_user_id
from backend.utils.database.models import (
    GrammarPoint,
    GrammarPrerequisite,
    UserGrammarProgress,
)

bp = Blueprint("list_grammar_points", __name__)


@bp.get("/grammar-points")
def list_grammar_points():
    points = GrammarPoint.query.order_by(
        GrammarPoint.hsk_level, GrammarPoint.title
    ).all()

    prerequisites_by_grammar_id: dict[str, list[str]] = {}
    for prerequisite in GrammarPrerequisite.query.all():
        prerequisites_by_grammar_id.setdefault(prerequisite.grammar_id, []).append(
            prerequisite.prerequisite_id
        )

    progress_rows = UserGrammarProgress.query.filter_by(
        user_id=current_user_id()
    ).all()
    status_by_grammar_id = {row.grammar_id: row.status for row in progress_rows}
    score_by_grammar_id = {row.grammar_id: row.score for row in progress_rows}

    return [
        {
            "id": point.id,
            "hsk_level": point.hsk_level,
            "title": point.title,
            "prerequisites": prerequisites_by_grammar_id.get(point.id, []),
            "status": status_by_grammar_id.get(point.id, "TODO"),
            "score": (
                int(score_by_grammar_id[point.id])
                if score_by_grammar_id.get(point.id) is not None
                else None
            ),
        }
        for point in points
    ], 200
