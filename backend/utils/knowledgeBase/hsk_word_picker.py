"""Pick the next HSK word for the knowledge-base "smart creation" wizard.

Words are probed with an exponential/binary-search style walk over the HSK
vocabulary ordered by level then frequency: each "can write it" / "can
recognize it" answer doubles the step and jumps further ahead (assuming
everything skipped in between is also known), each "don't know it" answer
shrinks the step and backtracks into the gap between the last confirmed
word and the rejected one.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.utils.database.models import HskWord, IgnoreHskWord, Word

MIN_INCREMENT = 1
RECOGNIZE_GROWTH_THRESHOLD = 10

DECISION_CAN_WRITE = "can_write"
DECISION_CAN_RECOGNIZE = "can_recognize"
DECISION_DONT_KNOW = "dont_know"


@dataclass
class WordPickResult:
    next_word: HskWord | None
    current_index: int
    previous_index: int
    increment: int
    words_between: list[HskWord] = field(default_factory=list)


def _ordered_unseen_words(user_id: str) -> list[HskWord]:
    """HSK words ordered by level then frequency, deduplicated by word text,
    with the user's already-known words removed.

    ponytail: loads the whole HSK vocabulary into memory per request. Fine
    at this app's scale; index it (or cache it) if the table grows large.
    """
    known_words = {row.word for row in Word.query.filter_by(user_id=user_id).all()}
    ignored_words = {
        row.writing for row in IgnoreHskWord.query.filter_by(user_id=user_id).all()
    }
    excluded_words = known_words | ignored_words

    seen: set[str] = set()
    ordered: list[HskWord] = []
    for entry in HskWord.query.order_by(
        HskWord.level.asc(),
        HskWord.frequency.asc(),
        HskWord.word.asc(),
        HskWord.pinyin.asc(),
    ):
        if entry.word in excluded_words or entry.word in seen:
            continue
        seen.add(entry.word)
        ordered.append(entry)
    return ordered


def suggested_hsk_words(user_id: str, *, limit: int = 10) -> list[HskWord]:
    """The ``limit`` most strategic unseen HSK words (level, then frequency)."""
    return _ordered_unseen_words(user_id)[:limit]


def _advance_index(
    decision: str,
    current_index: int,
    previous_index: int,
    increment: int,
) -> tuple[int, int, int]:
    """Return (target_index, new_previous_index, new_increment)."""
    if decision == DECISION_CAN_WRITE:
        new_increment = increment * 2
        return current_index + new_increment, current_index, new_increment

    if decision == DECISION_CAN_RECOGNIZE:
        new_increment = (
            increment * 2 if increment < RECOGNIZE_GROWTH_THRESHOLD else increment
        )
        return current_index + new_increment, current_index, new_increment

    if decision == DECISION_DONT_KNOW:
        new_increment = max(MIN_INCREMENT, increment // 4)
        return previous_index + new_increment, previous_index, new_increment

    raise ValueError(f"Unknown decision: {decision}")


def pick_next_hsk_word(
    user_id: str,
    *,
    decision: str | None,
    current_index: int,
    previous_index: int,
    increment: int,
    exclude_words: set[str] | None = None,
) -> WordPickResult:
    """Apply the caller's answer to ``current_index`` and return the next word.

    ``current_index`` / ``previous_index`` / ``increment`` are the state
    returned by the previous call (the caller — the wizard — is the only
    place this state lives; this function is stateless). Pass
    ``decision=None`` for the very first pick, to fetch ``current_index``
    (normally 0) without applying a decision.
    """
    exclude_words = exclude_words or set()
    ordered = _ordered_unseen_words(user_id)

    words_between: list[HskWord] = []
    if decision is None:
        target_index = current_index
        new_previous_index = previous_index
        new_increment = increment
    else:
        if decision in (DECISION_CAN_WRITE, DECISION_CAN_RECOGNIZE):
            words_between = [
                entry
                for entry in ordered[previous_index + 1 : current_index]
                if entry.word not in exclude_words
            ]
        target_index, new_previous_index, new_increment = _advance_index(
            decision, current_index, previous_index, increment
        )

    idx = max(target_index, 0)
    while idx < len(ordered) and ordered[idx].word in exclude_words:
        idx += 1

    next_word = ordered[idx] if idx < len(ordered) else None

    return WordPickResult(
        next_word=next_word,
        current_index=idx,
        previous_index=new_previous_index,
        increment=new_increment,
        words_between=words_between,
    )
