from flask import Blueprint, request

from backend.utils.auth.user_context import current_user
from backend.utils.writing.writing_drafts import load_draft, save_draft

bp = Blueprint("writing_draft", __name__)


@bp.get("/writing/draft/<topic_id>")
def get_writing_draft(topic_id: str):
    try:
        return load_draft(current_user().id, topic_id), 200
    except ValueError as error:
        return {"error": str(error)}, 400


@bp.post("/writing/draft/<topic_id>")
def save_writing_draft(topic_id: str):
    body = request.get_json(silent=True) or {}
    draft = body.get("draft")
    if not isinstance(draft, str):
        return {"error": "draft must be a string"}, 400

    try:
        return save_draft(current_user().id, topic_id, draft), 200
    except ValueError as error:
        return {"error": str(error)}, 400
