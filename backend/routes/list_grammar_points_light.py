from flask import Blueprint

from backend.utils.auth.user_context import current_user
from backend.utils.database.models import GrammarPoint
from backend.utils.grammar.grammar_content_loader import (
    curriculum_index,
    fetch_grammar_titles,
)

bp = Blueprint("list_grammar_points_light", __name__)


@bp.get("/grammar-points-light")
def list_grammar_points_light():
    language = current_user().language
    grammar_titles = fetch_grammar_titles(language)

    points = sorted(
        GrammarPoint.query.all(),
        key=lambda point: (
            point.hsk_level,
            curriculum_index(point.s3_key),
            point.s3_key or "",
        ),
    )

    return {
        "grammar_points": [
            {
                "id": point.id,
                "hsk_level": point.hsk_level,
                "index": curriculum_index(point.s3_key),
                "title": grammar_titles.get(point.s3_key, point.title),
            }
            for point in points
        ],
    }, 200
