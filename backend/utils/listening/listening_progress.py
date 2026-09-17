"""Computes and serializes a user's listening-practice progress.

``vocabulary_score`` is the percentage of a topic's ``unique_chars`` already
in the learner's knowledge base (``character`` rows); ``grammar_score`` is
the percentage of its comma-separated ``grammar_rules`` already
``DONE``/``MASTERED`` in ``user_grammar_progress``. Both are per-HSK-level,
per-user, and expensive to compute (they scan the learner's whole character
set and grammar progress), unlike the catalog fields
(``id``/``title``/``hsk_level``/``type``/``topic``/``translated_topic``),
which are static and served separately by ``GET /listening-practices-light``
(``backend/routes/list_listening_practices_light.py``).
``refresh_and_list_listening_practices_for_level`` recomputes and returns
both scores for one HSK level's topics in a single call — the frontend
fetches this once per visible level (mirroring the grammar-points
light/per-level split) instead of one call refreshing every visible topic
at once.
"""

from __future__ import annotations

from backend.utils.database.extensions import db
from backend.utils.database.models import (
    Character,
    ListeningPractice,
    ListeningProgress,
    UserGrammarProgress,
)

COMPLETED_GRAMMAR_STATUSES = {"DONE", "MASTERED"}
DEFAULT_STATUS = "TODO"


def _percent(covered: int, total: int) -> int:
    """Percentage covered, rounded. A rule/topic with nothing to cover is 100%."""
    return round((covered / total) * 100) if total else 100


def _topics_for_level(hsk_level: int) -> list[ListeningPractice]:
    return (
        ListeningPractice.query.filter_by(hsk_level=hsk_level)
        .order_by(ListeningPractice.id)
        .all()
    )


def refresh_and_list_listening_practices_for_level(
    user_id: str, hsk_level: int
) -> list[dict]:
    """Recompute vocabulary_score/grammar_score for one HSK level's topics.

    Creates a TODO listening_progress row for a topic the user has never
    opened; an existing row keeps its status untouched (status transitions
    happen elsewhere) and only gets its scores recomputed.
    """
    topics = _topics_for_level(hsk_level)
    topic_ids = [topic.id for topic in topics]
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
        for row in ListeningProgress.query.filter_by(user_id=user_id)
        .filter(ListeningProgress.listening_topic.in_(topic_ids))
        .all()
    }

    results = []
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

        results.append(
            {
                "id": topic.id,
                "status": progress.status,
                "vocabulary_score": vocabulary_score,
                "grammar_score": grammar_score,
            }
        )

    db.session.commit()
    return results
