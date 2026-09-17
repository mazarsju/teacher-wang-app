from flask import Blueprint

from backend.utils.auth.user_context import current_user, current_user_id
from backend.utils.database.models import WritingPractice, WritingProgress
from backend.utils.grammar.grammar_content_loader import fetch_writing_practice_titles

bp = Blueprint("list_writing_practices", __name__)


@bp.get("/writing-practices")
def list_writing_practices():
    language = current_user().language
    writing_practice_titles = fetch_writing_practice_titles(language)

    writing_progress_rows = WritingProgress.query.filter_by(
        user_id=current_user_id()
    ).all()
    status_by_writing_topic = {
        row.writing_topic: row.status for row in writing_progress_rows
    }

    return {
        "writing_practices": [
            {
                "id": practice.id,
                "title": writing_practice_titles.get(practice.id, practice.title),
                "after_grammar_point": practice.after_grammar_point,
                "status": status_by_writing_topic.get(practice.id, "TODO"),
            }
            for practice in WritingPractice.query.all()
        ],
    }, 200
