from flask import Blueprint

from backend.utils.auth.user_context import current_user
from backend.utils.database.settings import ADMIN_EMAIL
from backend.utils.generateArticle.service import run_weekly_article_generation
from backend.utils.request_logging import progress_log

bp = Blueprint("generate_article", __name__)


@bp.post("/admin/articles/generate")
def generate_article():
    if current_user().email != ADMIN_EMAIL:
        progress_log("generate_article.forbidden")
        return {"error": "Forbidden"}, 403

    try:
        weekly_articles = run_weekly_article_generation()
    except ValueError as error:
        progress_log(
            "generate_article.error",
            kind="ValueError",
            message=repr(str(error)),
        )
        return {"error": str(error)}, 400
    except Exception as error:
        progress_log(
            "generate_article.error",
            kind=type(error).__name__,
            message=repr(str(error)),
        )
        return {"error": "Failed to generate article selection"}, 500

    return {"weekly_articles": weekly_articles}, 200
