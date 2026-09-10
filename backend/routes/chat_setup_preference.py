from flask import Blueprint, request

from backend.utils.auth.user_context import current_user, current_user_id
from backend.utils.database.settings import (
    CHAT_LISTEN_SPEED_ADJUSTMENTS,
    CHAT_LISTENING_MODES,
    get_chat_listen_speed_adjustment,
    get_chat_listening_mode,
    get_chat_realistic_voice_enabled,
    set_chat_listen_speed_adjustment,
    set_chat_listening_mode,
    set_chat_realistic_voice_enabled,
)

bp = Blueprint("chat_setup_preference", __name__)


def _payload(user_id: str, plan: str) -> dict:
    return {
        "listening_mode": get_chat_listening_mode(user_id),
        "listen_speed_adjustment": get_chat_listen_speed_adjustment(user_id),
        # Effective value: a downgraded-to-free user never sees this as enabled,
        # even if the underlying setting is still "true" from their pro days.
        "realistic_voice_enabled": plan == "pro"
        and get_chat_realistic_voice_enabled(user_id),
    }


@bp.get("/preferences/chat-setup")
def get_chat_setup_preference():
    return _payload(current_user_id(), current_user().plan), 200


@bp.patch("/preferences/chat-setup")
def update_chat_setup_preference():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return {"error": "Request body must be a JSON object"}, 400

    user_id = current_user_id()
    plan = current_user().plan

    if "listening_mode" in data:
        listening_mode = data["listening_mode"]
        if listening_mode not in CHAT_LISTENING_MODES:
            return {
                "error": f"listening_mode must be one of {sorted(CHAT_LISTENING_MODES)}"
            }, 400
        set_chat_listening_mode(user_id, listening_mode, commit=True)

    if "listen_speed_adjustment" in data:
        adjustment = data["listen_speed_adjustment"]
        if (
            not isinstance(adjustment, int)
            or isinstance(adjustment, bool)
            or adjustment not in CHAT_LISTEN_SPEED_ADJUSTMENTS
        ):
            return {
                "error": f"listen_speed_adjustment must be one of {sorted(CHAT_LISTEN_SPEED_ADJUSTMENTS)}"
            }, 400
        set_chat_listen_speed_adjustment(user_id, adjustment, commit=True)

    if "realistic_voice_enabled" in data:
        enabled = data["realistic_voice_enabled"]
        if not isinstance(enabled, bool):
            return {"error": "realistic_voice_enabled must be a boolean"}, 400
        if enabled and plan != "pro":
            return {"error": "realistic_voice_enabled requires the pro plan"}, 403
        set_chat_realistic_voice_enabled(user_id, enabled, commit=True)

    return _payload(user_id, plan), 200
