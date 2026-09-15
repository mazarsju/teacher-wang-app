from flask import Blueprint

from backend.utils.auth.user_context import current_user, current_user_id
from backend.utils.listening.listening_progress import (
    get_user_hsk_level,
    list_listening_practices_for_user,
)

bp = Blueprint("list_listening_practices", __name__)


@bp.get("/listening-practices")
def list_listening_practices():
    user_id = current_user_id()
    return {
        "listening_practices": list_listening_practices_for_user(
            user_id, current_user().language
        ),
        "current_hsk_level": get_user_hsk_level(user_id),
    }, 200
