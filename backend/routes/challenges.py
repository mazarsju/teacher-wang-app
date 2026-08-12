from flask import Blueprint

from backend.utils.aiChat.challenges import get_challenges_progress
from backend.utils.auth.user_context import current_user_id

bp = Blueprint("challenges", __name__)


@bp.get("/challenges/progress")
def challenges_progress():
    return get_challenges_progress(current_user_id()), 200
