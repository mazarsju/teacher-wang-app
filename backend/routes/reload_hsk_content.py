from flask import Blueprint

from backend.routes.hsk_content_loader import reload_hsk_content
from backend.settings import ADMIN_EMAIL
from backend.user_context import current_user

bp = Blueprint("reload_hsk_content", __name__)


@bp.post("/admin/hsk/reload")
def reload_hsk():
    if current_user().email != ADMIN_EMAIL:
        return {"error": "Forbidden"}, 403

    counts = reload_hsk_content()
    return {"message": "HSK content reloaded", "counts": counts}, 200
