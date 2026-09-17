from flask import Blueprint

from backend.utils.auth.user_context import current_user_id
from backend.utils.listening.listening_progress import (
    refresh_and_list_listening_practices_for_level,
)

bp = Blueprint("list_listening_practices", __name__)


@bp.get("/listening-practices/<int:hsk_level>")
def list_listening_practices(hsk_level):
    return {
        "listening_practices": refresh_and_list_listening_practices_for_level(
            current_user_id(), hsk_level
        ),
    }, 200
