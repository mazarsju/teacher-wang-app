from flask import Blueprint

from backend.utils.auth.user_context import current_user_id
from backend.utils.listening.listening_progress import list_listening_practices_for_user

bp = Blueprint("list_listening_practices", __name__)


@bp.get("/listening-practices")
def list_listening_practices():
    return {
        "listening_practices": list_listening_practices_for_user(current_user_id())
    }, 200
