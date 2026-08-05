from flask import Blueprint

from backend.challenges import get_challenges_progress
from backend.user_context import current_user

bp = Blueprint("challenges", __name__)


@bp.get("/challenges/progress")
def challenges_progress():
    # S3 object keys are keyed by the Cognito sub, not users.shortid.
    return get_challenges_progress(current_user().id), 200
