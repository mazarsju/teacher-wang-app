from flask import Blueprint

from backend.hsk_level import get_hsk_level_status
from backend.user_context import current_user_id

bp = Blueprint("get_hsk_level", __name__)


@bp.get("/hsk-level")
def get_hsk_level():
    return get_hsk_level_status(user_id=current_user_id()), 200
