from flask import Blueprint, request

from backend.utils.aiChat.chat_service import check_user_grammar
from backend.utils.auth.user_context import current_user_id

bp = Blueprint("check_writing_sentence", __name__)


@bp.post("/writing/check-sentence")
def check_writing_sentence():
    body = request.get_json(silent=True) or {}
    text = body.get("text")
    if not isinstance(text, str) or text.strip() == "":
        return {"error": "text must be a non-empty string"}, 400

    try:
        correction = check_user_grammar(current_user_id(), text)
    except ValueError as error:
        return {"error": str(error)}, 400
    except Exception:
        return {"error": "Failed to check the sentence's grammar"}, 500

    return correction.to_dict(), 200
