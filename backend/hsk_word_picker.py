"""Pick the next HSK word for the knowledge-base "smart creation" wizard."""

from __future__ import annotations

from backend.models import HskWord, Word


def pick_next_hsk_word(
    user_id: str,
    exclude_words: set[str] | None = None,
) -> HskWord | None:
    """Return the next unseen HSK word, ordered by frequency.

    ponytail: naive "lowest frequency, not already known or excluded" pick.
    Swap for a smarter selection strategy (spaced repetition, level
    targeting, etc.) once the wizard needs one.
    """
    exclude_words = exclude_words or set()
    known_words = {row.word for row in Word.query.filter_by(user_id=user_id).all()}
    skip_words = known_words | exclude_words

    query = HskWord.query.order_by(HskWord.frequency.asc())
    if skip_words:
        query = query.filter(~HskWord.word.in_(skip_words))
    return query.first()
