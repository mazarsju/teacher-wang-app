from datetime import datetime, timezone

from flask import Blueprint

from backend.utils.auth.user_context import current_user_id
from backend.utils.database.models import WeeklyArticle
from backend.utils.knowledgeBase.hsk_level import get_stored_current_hsk_level

bp = Blueprint("weekly_articles", __name__)

MIN_ARTICLE_HSK_LEVEL = 1
MAX_ARTICLE_HSK_LEVEL = 6


def _article_hsk_level(user_id: str) -> int:
    level = (get_stored_current_hsk_level(user_id) + 1) or MIN_ARTICLE_HSK_LEVEL
    return max(MIN_ARTICLE_HSK_LEVEL, min(MAX_ARTICLE_HSK_LEVEL, level))


@bp.get("/weekly-articles")
def get_weekly_article():
    hsk_level = _article_hsk_level(current_user_id())
    iso_year, iso_week, _ = datetime.now(timezone.utc).isocalendar()

    article = WeeklyArticle.query.filter_by(
        week=iso_week, year=iso_year, hsk_level=hsk_level
    ).one_or_none()

    return {
        "week": iso_week,
        "year": iso_year,
        "hsk_level": hsk_level,
        "content": article.content if article else None,
    }, 200
