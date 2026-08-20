from flask import Blueprint

from backend.utils.auth.user_context import current_user
from backend.utils.database.settings import ADMIN_EMAIL
from backend.utils.grammar.grammar_content_loader import reload_grammar_content

bp = Blueprint("reload_grammar_rules", __name__)


@bp.post("/admin/grammar/reload")
def reload_grammar():
    if current_user().email != ADMIN_EMAIL:
        return {"error": "Forbidden"}, 403

    counts = reload_grammar_content()
    return {"message": "Grammar rules reloaded", "counts": counts}, 200
