from flask import Blueprint

from backend.challenges import get_challenges_progress

bp = Blueprint("challenges", __name__)


@bp.get("/challenges/progress")
def challenges_progress():
    return get_challenges_progress(), 200
