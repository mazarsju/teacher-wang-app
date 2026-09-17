from flask import Blueprint

from backend.utils.auth.user_context import current_user_id
from backend.utils.knowledgeBase.hsk_level import get_stored_current_hsk_level

bp = Blueprint("get_hsk_level_light", __name__)


@bp.get("/hsk-level-light")
def get_hsk_level_light():
    return {"current_level": get_stored_current_hsk_level(current_user_id())}, 200
