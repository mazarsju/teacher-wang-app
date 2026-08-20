import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Blueprint

from backend.utils.aiChat.llm_config import read_config_value
from backend.utils.auth.user_context import current_user
from backend.utils.database.settings import ADMIN_EMAIL
from backend.utils.request_logging import progress_log
from backend.utils.generateArticle.weekly_article_generator import generate_weekly_articles

bp = Blueprint("generate_article", __name__)

CURRENTS_API_KEY_ENV = "CURRENTS_API_KEY"
CURRENTS_SEARCH_URL = "https://api.currentsapi.services/v1/search"

GUARDIAN_API_KEY_ENV = "GUARDIAN_API_KEY"
GUARDIAN_SEARCH_URL = "https://content.guardianapis.com/search"

ARTICLE_SOURCE_CURRENTS = "currents"
ARTICLE_SOURCE_GUARDIAN = "guardian"

# Hardcoded choice of news source for weekly article generation.
ARTICLE_SOURCE = ARTICLE_SOURCE_GUARDIAN

# Cloudflare (in front of some news APIs) blocks urllib's default
# "Python-urllib/…" User-Agent as a bot signature (error code: 1010).
USER_AGENT = "teacher-wang-app/1.0"


def _require_api_key(env_name: str) -> str:
    api_key = read_config_value(env_name)
    if not api_key:
        raise ValueError(
            f"{env_name} must be set as an environment variable "
            "(or in .config.txt for local development)"
        )
    return api_key


def _get_json(url: str) -> dict:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=10) as response:  # noqa: S310 - fixed https API host
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError) as error:
        raise ValueError(f"News API request failed: {error}") from error


def _fetch_from_currents() -> list[dict]:
    api_key = _require_api_key(CURRENTS_API_KEY_ENV)
    query = urlencode({"keywords": "China", "language": "en", "apiKey": api_key})
    payload = _get_json(f"{CURRENTS_SEARCH_URL}?{query}")
    return payload.get("news", [])


def _fetch_from_guardian() -> list[dict]:
    api_key = _require_api_key(GUARDIAN_API_KEY_ENV)
    query = urlencode(
        {
            "q": "China",
            "api-key": api_key,
            "show-fields": "trailText",
            "order-by": "newest",
            "page-size": "20",
        }
    )
    payload = _get_json(f"{GUARDIAN_SEARCH_URL}?{query}")
    results = payload.get("response", {}).get("results", [])
    return [
        {
            "id": item.get("id", ""),
            "title": item.get("webTitle", ""),
            "description": item.get("fields", {}).get("trailText", ""),
            "category": [item["sectionName"]] if item.get("sectionName") else [],
        }
        for item in results
    ]


def _fetch_china_articles() -> list[dict]:
    if ARTICLE_SOURCE == ARTICLE_SOURCE_GUARDIAN:
        return _fetch_from_guardian()
    return _fetch_from_currents()


@bp.post("/admin/articles/generate")
def generate_article():
    if current_user().email != ADMIN_EMAIL:
        progress_log("generate_article.forbidden")
        return {"error": "Forbidden"}, 403

    progress_log("generate_article.start", source=ARTICLE_SOURCE)
    try:
        progress_log("generate_article.fetch.start", source=ARTICLE_SOURCE)
        articles = _fetch_china_articles()
        progress_log("generate_article.fetch.done", count=len(articles))
        if not articles:
            progress_log("generate_article.skip_empty")
            weekly_articles = None
        else:
            progress_log("generate_article.weekly.start")
            weekly_articles = generate_weekly_articles(articles)
            progress_log(
                "generate_article.weekly.done",
                week=weekly_articles.get("week"),
                year=weekly_articles.get("year"),
            )
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

    progress_log("generate_article.done")
    return {"weekly_articles": weekly_articles}, 200
