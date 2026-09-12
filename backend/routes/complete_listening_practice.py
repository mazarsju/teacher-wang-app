from flask import Blueprint, request

from backend.utils.auth.user_context import current_user_id
from backend.utils.database.extensions import db
from backend.utils.database.models import ListeningPractice, ListeningProgress

bp = Blueprint("complete_listening_practice", __name__)


@bp.post("/listening-practices/<topic_id>/complete")
def complete_listening_practice(topic_id: str):
    """The learner's own yes/no call on whether they've mastered this topic.

    There's no score threshold here — completion is a judgment call the
    frontend asks the learner to make explicitly, not something inferred
    from the comprehension exercises' score.
    """
    user_id = current_user_id()

    if ListeningPractice.query.get(topic_id) is None:
        return {"error": "Listening practice not found"}, 404

    body = request.get_json(silent=True) or {}
    completed = body.get("completed")
    if not isinstance(completed, bool):
        return {"error": "completed must be a boolean"}, 400

    progress = ListeningProgress.query.filter_by(
        user_id=user_id, listening_topic=topic_id
    ).first()
    if progress is None:
        progress = ListeningProgress(user_id=user_id, listening_topic=topic_id)
        db.session.add(progress)

    status = "DONE" if completed else "WIP"
    progress.status = status
    db.session.commit()

    return {
        "status": status,
        "vocabulary_score": progress.vocabulary_score,
        "grammar_score": progress.grammar_score,
    }, 200
