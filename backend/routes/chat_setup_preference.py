from flask import Blueprint, request

from backend.utils.auth.user_context import current_user_id
from backend.utils.database.settings import (
    CHAT_LISTEN_SPEED_ADJUSTMENTS,
    CHAT_LISTENING_MODES,
    get_chat_listen_speed_adjustment,
    get_chat_listening_mode,
    set_chat_listen_speed_adjustment,
    set_chat_listening_mode,
)

bp = Blueprint("chat_setup_preference", __name__)


def _payload(user_id: str) -> dict:
    return {
        "listening_mode": get_chat_listening_mode(user_id),
        "listen_speed_adjustment": get_chat_listen_speed_adjustment(user_id),
    }


@bp.get("/preferences/chat-setup")
def get_chat_setup_preference():
    return _payload(current_user_id()), 200


@bp.patch("/preferences/chat-setup")
def update_chat_setup_preference():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return {"error": "Request body must be a JSON object"}, 400

    user_id = current_user_id()

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

    return _payload(user_id), 200
