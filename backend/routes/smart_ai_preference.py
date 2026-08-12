from flask import Blueprint, request

from backend.utils.database.settings import get_smart_ai_enabled, set_smart_ai_enabled
from backend.utils.auth.user_context import current_user_id

bp = Blueprint("smart_ai_preference", __name__)


@bp.get("/preferences/smart-ai")
def get_smart_ai_preference():
    return {"enabled": get_smart_ai_enabled(current_user_id())}, 200


@bp.patch("/preferences/smart-ai")
def update_smart_ai_preference():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or "enabled" not in data:
        return {"error": "Missing required field: enabled"}, 400

    enabled = data["enabled"]
    if not isinstance(enabled, bool):
        return {"error": "enabled must be a boolean"}, 400

    set_smart_ai_enabled(current_user_id(), enabled, commit=True)
    return {"enabled": enabled}, 200
