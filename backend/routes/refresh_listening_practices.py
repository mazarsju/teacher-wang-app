from flask import Blueprint

from backend.utils.auth.user_context import current_user_id
from backend.utils.listening.listening_progress import refresh_listening_progress

bp = Blueprint("refresh_listening_practices", __name__)


@bp.post("/listening-practices/refresh")
def refresh_listening_practices():
    count = refresh_listening_progress(current_user_id())
    return {"message": "Listening progress refreshed", "count": count}, 200
