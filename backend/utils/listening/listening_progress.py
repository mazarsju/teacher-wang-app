"""Computes and serializes a user's listening-practice progress.

A topic is visible once its ``hsk_level`` is at or below the learner's
current HSK level + 1 (same "achieved level + 1" rule the grammar/writing
curriculum uses, see ``speaking_hsk_level_from_current``). ``vocabulary_score``
is the percentage of a topic's ``unique_chars`` already in the learner's
knowledge base (``character`` rows); ``grammar_score`` is the percentage of
its comma-separated ``grammar_rules`` already ``DONE``/``MASTERED`` in
``user_grammar_progress``. Both are recomputed by ``refresh_listening_progress``
(called on login) and read back as-is by ``list_listening_practices_for_user``.

``title``/``type``/``topic`` are translated via
``fetch_listening_practice_translations`` for any non-English ``language``,
falling back to the English DB row for a topic (or field) without a
translation — see that function's docstring.
"""

from __future__ import annotations

from backend.utils.database.extensions import db
from backend.utils.database.models import (
    Character,
    ListeningPractice,
    ListeningProgress,
    UserGrammarProgress,
)
from backend.utils.knowledgeBase.hsk_level import (
    get_stored_current_hsk_level,
    speaking_hsk_level_from_current,
)
from backend.utils.listening.listening_content_loader import (
    fetch_listening_practice_translations,
)

COMPLETED_GRAMMAR_STATUSES = {"DONE", "MASTERED"}
DEFAULT_STATUS = "TODO"


def _percent(covered: int, total: int) -> int:
    """Percentage covered, rounded. A rule/topic with nothing to cover is 100%."""
    return round((covered / total) * 100) if total else 100


def _visible_topics(user_id: str) -> list[ListeningPractice]:
    max_level = speaking_hsk_level_from_current(get_stored_current_hsk_level(user_id))
    return (
        ListeningPractice.query.filter(ListeningPractice.hsk_level <= max_level)
        .order_by(ListeningPractice.hsk_level, ListeningPractice.id)
        .all()
    )


def list_listening_practices_for_user(user_id: str, language: str = "en") -> list[dict]:
    topics = _visible_topics(user_id)
    translations = fetch_listening_practice_translations(language)
    progress_by_topic = {
        row.listening_topic: row
        for row in ListeningProgress.query.filter_by(user_id=user_id).all()
    }

    return [
        {
            "id": topic.id,
            "title": translations.get(topic.id, {}).get("title", topic.title),
            "hsk_level": topic.hsk_level,
            "type": translations.get(topic.id, {}).get("type", topic.type),
            "topic": translations.get(topic.id, {}).get("topic", topic.topic),
            "status": (
                progress_by_topic[topic.id].status
                if topic.id in progress_by_topic
                else DEFAULT_STATUS
            ),
            "vocabulary_score": (
                progress_by_topic[topic.id].vocabulary_score
                if topic.id in progress_by_topic
                else 0
            ),
            "grammar_score": (
                progress_by_topic[topic.id].grammar_score
                if topic.id in progress_by_topic
                else 0
            ),
        }
        for topic in topics
    ]


def refresh_listening_progress(user_id: str) -> int:
    """Recompute vocabulary_score/grammar_score for every currently visible topic.

    Creates a TODO listening_progress row for a topic the user has never
    opened; an existing row keeps its status untouched (status transitions
    happen elsewhere) and only gets its scores recomputed. Returns the
    number of topics refreshed.
    """
    topics = _visible_topics(user_id)
    known_chars = {
        row.char for row in Character.query.filter_by(user_id=user_id).all()
    }
    completed_grammar_ids = {
        row.grammar_id
        for row in UserGrammarProgress.query.filter_by(user_id=user_id).all()
        if row.status in COMPLETED_GRAMMAR_STATUSES
    }
    progress_by_topic = {
        row.listening_topic: row
        for row in ListeningProgress.query.filter_by(user_id=user_id).all()
    }

    for topic in topics:
        topic_chars = set(topic.unique_chars or "")
        vocabulary_score = _percent(len(topic_chars & known_chars), len(topic_chars))

        rule_ids = set(topic.grammar_rules.split(",")) if topic.grammar_rules else set()
        grammar_score = _percent(len(rule_ids & completed_grammar_ids), len(rule_ids))

        progress = progress_by_topic.get(topic.id)
        if progress is None:
            progress = ListeningProgress(
                user_id=user_id,
                listening_topic=topic.id,
                status=DEFAULT_STATUS,
            )
            db.session.add(progress)
        progress.vocabulary_score = vocabulary_score
        progress.grammar_score = grammar_score

    db.session.commit()
    return len(topics)
