import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Blueprint

from backend.utils.aiChat.llm_config import read_config_value
from backend.utils.auth.user_context import current_user
from backend.utils.database.settings import ADMIN_EMAIL
from backend.routes.weekly_article_generator import generate_weekly_articles

bp = Blueprint("generate_article", __name__)

CURRENTS_API_KEY_ENV = "CURRENTS_API_KEY"
CURRENTS_SEARCH_URL = "https://api.currentsapi.services/v1/search"


def _fetch_china_articles() -> list[dict]:
    api_key = read_config_value(CURRENTS_API_KEY_ENV)
    if not api_key:
        raise ValueError(
            f"{CURRENTS_API_KEY_ENV} must be set as an environment variable "
            "(or in .config.txt for local development)"
        )

    query = urlencode({"keywords": "China", "language": "en", "apiKey": api_key})
    url = f"{CURRENTS_SEARCH_URL}?{query}"
    # Cloudflare (in front of the Currents API) blocks urllib's default
    # "Python-urllib/…" User-Agent as a bot signature (error code: 1010).
    request = Request(url, headers={"User-Agent": "teacher-wang-app/1.0"})

    try:
        with urlopen(request, timeout=10) as response:  # noqa: S310 - fixed https API host
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError) as error:
        raise ValueError(f"Currents API request failed: {error}") from error

    return payload.get("news", [])


@bp.post("/admin/articles/generate")
def generate_article():
    if current_user().email != ADMIN_EMAIL:
        return {"error": "Forbidden"}, 403

    try:
        articles = _fetch_china_articles()
        weekly_articles = generate_weekly_articles(articles) if articles else None
    except ValueError as error:
        return {"error": str(error)}, 400
    except Exception:
        return {"error": "Failed to generate article selection"}, 500

    return {"weekly_articles": weekly_articles}, 200
