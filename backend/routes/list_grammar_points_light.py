from flask import Blueprint

from backend.utils.auth.user_context import current_user
from backend.utils.database.models import GrammarPoint, GrammarPointTranslation

bp = Blueprint("list_grammar_points_light", __name__)


@bp.get("/grammar-points-light")
def list_grammar_points_light():
    language = current_user().language
    grammar_titles = {
        row.point_id: row.translate
        for row in GrammarPointTranslation.query.filter_by(language=language).all()
    }

    points = sorted(
        GrammarPoint.query.all(),
        key=lambda point: (point.hsk_level, point.index, point.s3_key or ""),
    )

    return {
        "grammar_points": [
            {
                "id": point.id,
                "hsk_level": point.hsk_level,
                "index": point.index,
                "title": grammar_titles.get(point.id, point.title),
            }
            for point in points
        ],
    }, 200
