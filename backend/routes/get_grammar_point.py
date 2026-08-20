from flask import Blueprint

from backend.utils.auth.user_context import current_user_id
from backend.utils.database.models import (
    GrammarPoint,
    GrammarPrerequisite,
    UserGrammarProgress,
)
from backend.utils.grammar.grammar_content_loader import fetch_grammar_content

bp = Blueprint("get_grammar_point", __name__)


@bp.get("/grammar-points/<path:grammar_id>")
def get_grammar_point(grammar_id: str):
    point = GrammarPoint.query.get(grammar_id)
    if point is None:
        return {"error": "Grammar point not found"}, 404

    prerequisites = [
        row.prerequisite_id
        for row in GrammarPrerequisite.query.filter_by(grammar_id=grammar_id).all()
    ]
    progress = UserGrammarProgress.query.filter_by(
        user_id=current_user_id(), grammar_id=grammar_id
    ).first()

    content = (
        fetch_grammar_content(point.s3_key)
        if point.s3_key
        else {"explanation": None, "exercises": None}
    )

    return {
        "id": point.id,
        "hsk_level": point.hsk_level,
        "title": point.title,
        "prerequisites": prerequisites,
        "status": progress.status if progress else "TODO",
        "explanation": content["explanation"],
        "exercises": content["exercises"],
    }, 200
