import json

from flask import Blueprint, request

from backend.utils.auth.user_context import current_user_id
from backend.utils.database.extensions import db
from backend.utils.database.models import ListeningPractice, ListeningProgress

bp = Blueprint("save_listening_progress", __name__)


@bp.post("/listening-practices/<topic_id>/progress")
def save_listening_progress(topic_id: str):
    """Persists the learner's answers on this topic's Questions/Shadowing/
    Bonus sections, as a JSON-stringified blob — saved on every Verify/Check/
    Submit click, not on every keystroke (see ListeningPracticeDetailPage.tsx).
    """
    user_id = current_user_id()

    if ListeningPractice.query.get(topic_id) is None:
        return {"error": "Listening practice not found"}, 404

    body = request.get_json(silent=True) or {}
    progress = body.get("progress")
    if not isinstance(progress, dict):
        return {"error": "progress must be an object"}, 400

    row = ListeningProgress.query.filter_by(
        user_id=user_id, listening_topic=topic_id
    ).first()
    if row is None:
        row = ListeningProgress(user_id=user_id, listening_topic=topic_id)
        db.session.add(row)

    row.progress = json.dumps(progress)
    db.session.commit()

    return {"progress": progress}, 200
