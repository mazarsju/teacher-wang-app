"""Background LLM summarization of chat conversations.

Stores results in the ``conversation_summary`` table, keyed by the same
character id used for the conversation's transcript in the log store.
"""

from __future__ import annotations

import logging
import threading

from langchain_core.messages import HumanMessage, SystemMessage

from backend.utils.aiChat.chat_service import _llm_response_text
from backend.utils.aiChat.conversation_logs import load_conversation
from backend.utils.aiChat.llm import get_llm
from backend.utils.database.extensions import db
from backend.utils.database.models import ConversationSummary

logger = logging.getLogger(__name__)

SUMMARY_TRIGGER_MESSAGE_COUNT = 5

SUMMARY_SYSTEM_PROMPT = (
    "Summarize the following Mandarin-learning chat conversation between a "
    "learner and an AI character in 2-4 sentences, in English. Focus on "
    "what the learner practiced and any notable difficulties. Reply with "
    "only the summary text."
)


def should_summarize(message_count: int) -> bool:
    return message_count > 0 and message_count % SUMMARY_TRIGGER_MESSAGE_COUNT == 0


def queue_conversation_summary(app, user_id, log_user_id: str, character_id: str) -> None:
    """Fire-and-forget: summarize and store, run after the response is sent."""
    threading.Thread(
        target=_summarize_and_store,
        args=(app, user_id, log_user_id, character_id),
        daemon=True,
    ).start()


def _summarize_and_store(app, user_id, log_user_id: str, character_id: str) -> None:
    with app.app_context():
        try:
            messages = load_conversation(log_user_id, character_id)
            transcript = "\n".join(
                f"{message['role']}: {message['content']}" for message in messages
            )
            response = get_llm().invoke(
                [
                    SystemMessage(content=SUMMARY_SYSTEM_PROMPT),
                    HumanMessage(content=transcript),
                ]
            )
            summary_text = _llm_response_text(response)
            store_conversation_summary(user_id, character_id, summary_text)
        except Exception:
            logger.exception(
                "Failed to summarize conversation for character_id=%s", character_id
            )
        finally:
            db.session.remove()


def store_conversation_summary(user_id, character_id: str, summary_text: str) -> None:
    ConversationSummary.query.filter_by(
        user_id=user_id, conversation_id=character_id, latest=True
    ).update({"latest": False})
    db.session.add(
        ConversationSummary(
            user_id=user_id,
            conversation_id=character_id,
            summary={"text": summary_text},
            revision=1,
            latest=True,
        )
    )
    db.session.commit()


def delete_conversation_summaries(user_id, character_id: str | None = None) -> None:
    query = ConversationSummary.query.filter_by(user_id=user_id)
    if character_id is not None:
        query = query.filter_by(conversation_id=character_id)
    query.delete()
    db.session.commit()
