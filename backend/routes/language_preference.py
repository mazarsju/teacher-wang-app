from flask import Blueprint, request

from backend.utils.aiChat.behavior_spec import LANGUAGE_NAMES
from backend.utils.auth.user_context import current_user
from backend.utils.database.extensions import db

bp = Blueprint("language_preference", __name__)


@bp.patch("/preferences/language")
def update_language_preference():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or "language" not in data:
        return {"error": "Missing required field: language"}, 400

    language = data["language"]
    if language not in LANGUAGE_NAMES:
        return {"error": "Unsupported language"}, 400

    current_user().language = language
    db.session.commit()
    return {"language": language}, 200
