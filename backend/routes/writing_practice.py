from flask import Blueprint, request

from backend.utils.auth.user_context import current_user, current_user_id
from backend.utils.database.extensions import db
from backend.utils.database.models import WritingPractice, WritingProgress
from backend.utils.grammar.grammar_content_loader import fetch_writing_practice_content
from backend.utils.writing.writing_drafts import complete_draft, load_draft, save_draft

bp = Blueprint("writing_practice", __name__)


def _mark_progress(topic_id: str, status: str) -> None:
    user_id = current_user_id()
    progress = WritingProgress.query.filter_by(
        user_id=user_id, writing_topic=topic_id
    ).first()
    if progress is None:
        progress = WritingProgress(user_id=user_id, writing_topic=topic_id)
        db.session.add(progress)
    progress.status = status
    db.session.commit()


@bp.get("/writing-practice/<topic_id>")
def get_writing_practice(topic_id: str):
    practice = WritingPractice.query.get(topic_id)
    if practice is None:
        return {"error": "Writing practice topic not found"}, 404

    content = fetch_writing_practice_content(practice.id)
    try:
        draft = load_draft(current_user().id, topic_id)
    except ValueError as error:
        return {"error": str(error)}, 400

    _mark_progress(topic_id, "WIP")

    return {
        "title": practice.title,
        "context": content["context"],
        "draft": draft["draft"],
        "archive": draft["archive"],
    }, 200


@bp.post("/writing-practice/<topic_id>")
def save_writing_practice_draft(topic_id: str):
    body = request.get_json(silent=True) or {}
    draft = body.get("draft")
    if not isinstance(draft, str):
        return {"error": "draft must be a string"}, 400

    try:
        return save_draft(current_user().id, topic_id, draft), 200
    except ValueError as error:
        return {"error": str(error)}, 400


@bp.post("/writing-practice/<topic_id>/complete")
def complete_writing_practice_draft(topic_id: str):
    body = request.get_json(silent=True) or {}
    draft = body.get("draft")
    if not isinstance(draft, str):
        return {"error": "draft must be a string"}, 400

    try:
        result = complete_draft(current_user().id, topic_id, draft)
    except ValueError as error:
        return {"error": str(error)}, 400

    _mark_progress(topic_id, "DONE")

    return result, 200
