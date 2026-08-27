from flask import Blueprint

from backend.utils.auth.user_context import current_user_id
from backend.utils.database.models import (
    GrammarPoint,
    GrammarPrerequisite,
    UserGrammarProgress,
    WritingPractice,
    WritingProgress,
)
from backend.utils.grammar.grammar_content_loader import curriculum_index

bp = Blueprint("list_grammar_points", __name__)


@bp.get("/grammar-points")
def list_grammar_points():
    points = sorted(
        GrammarPoint.query.all(),
        key=lambda point: (
            point.hsk_level,
            curriculum_index(point.s3_key),
            point.s3_key or "",
        ),
    )

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

    writing_progress_rows = WritingProgress.query.filter_by(
        user_id=current_user_id()
    ).all()
    status_by_writing_topic = {
        row.writing_topic: row.status for row in writing_progress_rows
    }

    return {
        "grammar_points": [
            {
                "id": point.id,
                "hsk_level": point.hsk_level,
                "index": curriculum_index(point.s3_key),
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
        ],
        "writing_practices": [
            {
                "id": practice.id,
                "title": practice.title,
                "after_grammar_point": practice.after_grammar_point,
                "status": status_by_writing_topic.get(practice.id, "TODO"),
            }
            for practice in WritingPractice.query.all()
        ],
    }, 200
