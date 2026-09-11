from flask import Blueprint

from backend.utils.auth.user_context import current_user
from backend.utils.database.settings import ADMIN_EMAIL
from backend.utils.listening.listening_content_loader import reload_listening_content

bp = Blueprint("reload_listening_practice", __name__)


@bp.post("/admin/listening/reload")
def reload_listening():
    if current_user().email != ADMIN_EMAIL:
        return {"error": "Forbidden"}, 403

    try:
        counts = reload_listening_content()
    except ValueError as error:
        # Most commonly a listening topic references a grammarId that isn't
        # in grammar_points yet (content added before the next grammar
        # reload) — surface the real reason instead of a generic 500.
        return {"error": str(error)}, 400
    return {"message": "Listening practice reloaded", "counts": counts}, 200
