import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from flask import Blueprint
from langchain_core.messages import HumanMessage, SystemMessage

from backend.utils.aiChat.chat_service import _extract_json_object, _invoke_llm
from backend.utils.aiChat.llm_config import read_config_value
from backend.utils.auth.user_context import current_user
from backend.utils.database.settings import ADMIN_EMAIL

bp = Blueprint("generate_article", __name__)

CURRENTS_API_KEY_ENV = "CURRENTS_API_KEY"
CURRENTS_SEARCH_URL = "https://api.currentsapi.services/v1/search"
TOP_ARTICLE_COUNT = 3

ARTICLE_PICKER_SYSTEM_PROMPT = (
    "You are a news editor. Given a list of recent articles about China, "
    f"pick the {TOP_ARTICLE_COUNT} most important ones for a general "
    "audience following China-related news. Reply with only a JSON "
    'object: {"selected_ids": ["id1", "id2", "id3"]} using each '
    'article\'s "id" field, ordered from most to least important.'
)


def _fetch_china_articles() -> list[dict]:
    api_key = read_config_value(CURRENTS_API_KEY_ENV)
    if not api_key:
        raise ValueError(
            f"{CURRENTS_API_KEY_ENV} must be set as an environment variable "
            "(or in .config.txt for local development)"
        )

    query = urlencode({"keywords": "China", "language": "en", "apiKey": api_key})
    url = f"{CURRENTS_SEARCH_URL}?{query}"

    try:
        with urlopen(url, timeout=10) as response:  # noqa: S310 - fixed https API host
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError) as error:
        raise ValueError(f"Currents API request failed: {error}") from error

    return payload.get("news", [])


def _pick_top_articles(articles: list[dict]) -> list[dict]:
    if not articles:
        return []

    listing = "\n".join(
        f'{article.get("id")}: {article.get("title", "")} — '
        f'{article.get("description", "")}'
        for article in articles
    )

    raw, _ = _invoke_llm(
        [
            SystemMessage(content=ARTICLE_PICKER_SYSTEM_PROMPT),
            HumanMessage(content=f"Articles:\n{listing}"),
        ]
    )
    selected_ids = _extract_json_object(raw).get("selected_ids", [])

    by_id = {article.get("id"): article for article in articles}
    picked = [by_id[article_id] for article_id in selected_ids if article_id in by_id]
    return picked[:TOP_ARTICLE_COUNT]


@bp.post("/admin/articles/generate")
def generate_article():
    if current_user().email != ADMIN_EMAIL:
        return {"error": "Forbidden"}, 403

    try:
        articles = _fetch_china_articles()
        top_articles = _pick_top_articles(articles)
    except ValueError as error:
        return {"error": str(error)}, 400
    except Exception:
        return {"error": "Failed to generate article selection"}, 500

    return {"articles": top_articles}, 200
