"""Background LLM summarization of chat conversations.

Stores results in the ``conversation_summary`` table, keyed by the same
character id used for the conversation's transcript in the log store. Each
run merges the existing structured memory with the newest messages, using a
different memory schema for Teacher Wang than for other AI characters.
"""

from __future__ import annotations

import json
import logging
import threading

from langchain_core.messages import HumanMessage, SystemMessage

from backend.utils.aiChat.chat_service import (
    TEACHER_CHARACTER_ID,
    _extract_json_object,
    _llm_response_text,
)
from backend.utils.aiChat.conversation_logs import load_conversation
from backend.utils.aiChat.llm import get_llm
from backend.utils.database.extensions import db
from backend.utils.database.models import ConversationSummary

logger = logging.getLogger(__name__)

SUMMARY_TRIGGER_MESSAGE_COUNT = 5

TEACHER_WANG_SUMMARY_SYSTEM_PROMPT = """\
You maintain structured memory for Teacher Wang's conversations.

Update the existing memory with the new messages. Produce a merged memory,
not a summary of the new messages alone.

Preserve only information useful to a Mandarin teacher continuing the
conversation:

- current and important topics
- grammar/language points and the learner's demonstrated understanding
- important learner mistakes, difficulties and strengths
- vocabulary explicitly introduced or discussed
- unresolved questions or ongoing activities
- important context needed to continue the conversation

Prefer compact facts over prose. Remove greetings, filler, repetition,
and information already captured by the existing memory.

Accuracy is critical:
- Never invent learner knowledge, vocabulary, translations, pinyin or
  conclusions.
- Do not infer mastery merely because a concept was explained.
- Only record understanding, difficulty or successful production when
  supported by the messages.
- When uncertain, omit the information.

Keep useful existing information unless it is clearly obsolete or
redundant.

Return only the structured output defined by the schema:

{
  "teaching_context": {
    "current_topic": "string or null",
    "current_language_points": [
      {
        "topic": "string",
        "status": "introduced | practicing | partially_understood | misunderstood | demonstrated",
        "notes": "string"
      }
    ],
    "learner_difficulties": [
      "string"
    ],
    "learner_strengths": [
      "string"
    ],
    "introduced_vocabulary": [
      {
        "word": "string",
        "pinyin": "string or null",
        "meaning": "string or null",
        "status": "introduced | practicing | demonstrated | unclear"
      }
    ],
    "unresolved_questions": [
      "string"
    ]
  },
  "conversation_context": {
    "important_events": [
      "string"
    ],
    "ongoing_discussion": [
      "string"
    ]
  }
}\
"""

GENERIC_SUMMARY_SYSTEM_PROMPT = """\
You maintain structured memory for a conversational AI character.

Your job is to update the existing conversation memory with the new
messages so that the character can continue the conversation naturally.

You are NOT the character and must NOT respond to the user.

Produce a merged memory:
existing memory + new messages.

Preserve information that is useful for continuing the conversation:

- current topic and situation;
- important events that happened;
- current state of the conversation or situation;
- important information about the user or other participants;
- decisions, preferences, requests or constraints;
- unresolved topics or open threads;
- important facts that may need to be remembered later;
- tone or relationship information when relevant.

For roleplay or situation-based conversations, prioritize information
necessary to maintain the scenario and act consistently.

For casual conversations, prioritize meaningful facts, personal details,
opinions, plans and ongoing topics over conversational filler.

Do NOT preserve:
- greetings and pleasantries;
- repetitive dialogue;
- filler or small talk with no lasting relevance;
- exact wording unless it is important to the situation;
- information already represented in the existing memory.

Accuracy is critical:
- Never invent facts, intentions, relationships or preferences.
- Do not infer information that is not supported by the conversation.
- Preserve uncertainty when necessary.
- When information is uncertain or irrelevant, omit it.

Keep useful existing information unless it is clearly obsolete or
contradicted by the new messages.

Prefer compact factual statements over prose.

Return only the structured output defined by the schema.

{
  "conversation_context": {
    "topic": "string or null",
    "situation": "string or null",
    "current_state": "string or null",
    "important_events": [
      "string"
    ],
    "open_threads": [
      "string"
    ]
  },

  "participants": [
    {
      "name": "string",
      "role": "string or null",
      "relevant_information": [
        "string"
      ]
    }
  ],

  "important_information": [
    "string"
  ],

  "conversation_tone": "string or null"
}\
"""


def should_summarize(message_count: int) -> bool:
    return message_count > 0 and message_count % SUMMARY_TRIGGER_MESSAGE_COUNT == 0


def _system_prompt(character_id: str) -> str:
    if character_id == TEACHER_CHARACTER_ID:
        return TEACHER_WANG_SUMMARY_SYSTEM_PROMPT
    return GENERIC_SUMMARY_SYSTEM_PROMPT


def queue_conversation_summary(app, user_id, log_user_id: str, character_id: str) -> None:
    """Fire-and-forget: summarize and store, run after the response is sent."""
    threading.Thread(
        target=_summarize_and_store,
        args=(app, user_id, log_user_id, character_id),
        daemon=True,
    ).start()


def _existing_memory(user_id, character_id: str) -> dict | None:
    row = ConversationSummary.query.filter_by(
        user_id=user_id, conversation_id=character_id, latest=True
    ).one_or_none()
    return row.summary if row is not None else None


def _human_message(existing_memory: dict | None, new_messages: list[dict[str, str]]) -> str:
    existing_text = (
        json.dumps(existing_memory, ensure_ascii=False) if existing_memory else "null"
    )
    transcript = "\n".join(
        f"{message['role']}: {message['content']}" for message in new_messages
    )
    return f"Existing memory (JSON):\n{existing_text}\n\nNew messages:\n{transcript}"


def _summarize_and_store(app, user_id, log_user_id: str, character_id: str) -> None:
    with app.app_context():
        try:
            messages = load_conversation(log_user_id, character_id)
            new_messages = messages[-SUMMARY_TRIGGER_MESSAGE_COUNT:]
            existing_memory = _existing_memory(user_id, character_id)

            response = get_llm().invoke(
                [
                    SystemMessage(content=_system_prompt(character_id)),
                    HumanMessage(content=_human_message(existing_memory, new_messages)),
                ]
            )
            memory = _extract_json_object(_llm_response_text(response))
            store_conversation_summary(user_id, character_id, memory)
        except Exception:
            logger.exception(
                "Failed to summarize conversation for character_id=%s", character_id
            )
        finally:
            db.session.remove()


def store_conversation_summary(user_id, character_id: str, memory: dict) -> None:
    """Keep at most 2 rows per conversation: the latest, and the one before it.

    The previous "old" row (``latest=False``) is dropped, the current
    "latest" row becomes the new "old", and the merged memory is inserted
    as the new "latest".
    """
    old_row = ConversationSummary.query.filter_by(
        user_id=user_id, conversation_id=character_id, latest=False
    ).one_or_none()
    if old_row is not None:
        db.session.delete(old_row)

    latest_row = ConversationSummary.query.filter_by(
        user_id=user_id, conversation_id=character_id, latest=True
    ).one_or_none()
    next_revision = 1
    if latest_row is not None:
        next_revision = latest_row.revision + 1
        latest_row.latest = False

    db.session.add(
        ConversationSummary(
            user_id=user_id,
            conversation_id=character_id,
            summary=memory,
            revision=next_revision,
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
