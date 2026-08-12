from flask import Blueprint

from backend.utils.aiChat.conversation_log_storage import get_storage, object_key
from backend.utils.aiChat.conversation_summary import delete_conversation_summaries
from backend.utils.database.extensions import db
from backend.utils.database.models import (
    Character,
    IgnoreHskWord,
    IgnoreVocabCard,
    IgnoreWritingCard,
    Word,
)
from backend.utils.auth.user_context import current_user, current_user_id

bp = Blueprint("delete_knowledge_base", __name__)


@bp.delete("/database/knowledge-base")
def delete_knowledge_base():
    # Delete for a the current user, all words, all characters, all ignore words, all ignore characters
    Word.query.filter_by(user_id=current_user_id()).delete()
    Character.query.filter_by(user_id=current_user_id()).delete()
    IgnoreVocabCard.query.filter_by(user_id=current_user_id()).delete()
    IgnoreWritingCard.query.filter_by(user_id=current_user_id()).delete()
    IgnoreHskWord.query.filter_by(user_id=current_user_id()).delete()
    db.session.commit()

    # Chat history (transcripts, correction threads, challenge task progress)
    # lives under this user's whole prefix in the conversation-log store.
    get_storage().delete_prefix(object_key(current_user().id, ""))
    delete_conversation_summaries(current_user_id())

    return {"message": "Knowledge base deleted"}, 200
