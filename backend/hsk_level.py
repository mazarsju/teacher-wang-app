"""Estimate and persist the learner's HSK level from known characters."""

from __future__ import annotations

import math
from typing import Protocol, TypedDict

from backend.challenge_progress import mark_challenge_completed
from backend.models import Character, HskCharacter
from backend.settings import get_level, set_level

HSK_MAX_LEVEL = 7
HSK_LEVEL_COMPLETION_RATIO = 0.85

# Reaching this level implies enough basic vocabulary that the "meeting a new
# friend" beginner scenario is trivially satisfied, so it's auto-completed.
AUTO_COMPLETE_CHALLENGE_AT_LEVEL = {"challenge-new-friend": 2}


class HskVocabularyEntry(Protocol):
    character: str
    level: int
    frequency: int


class HskLevelStatus(TypedDict):
    current_level: int | None
    next_level: int | None
    characters_to_next_level: int | None
    progress_to_next_level: float
    missing_characters: list[str]
    max_level: int
    completion_ratio: float


def _required_known_count(total_characters: int) -> int:
    return math.ceil(total_characters * HSK_LEVEL_COMPLETION_RATIO)


def _entries_up_to_level(
    vocabulary: list[HskVocabularyEntry],
    level: int,
) -> list[HskVocabularyEntry]:
    return [entry for entry in vocabulary if entry.level <= level]


def _is_level_complete(
    known_characters: set[str],
    vocabulary: list[HskVocabularyEntry],
    level: int,
) -> bool:
    required = _entries_up_to_level(vocabulary, level)
    if not required:
        return False

    known_up_to_level = sum(
        1 for entry in required if entry.character in known_characters
    )
    return known_up_to_level >= _required_known_count(len(required))


def get_hsk_level_status(
    known_characters: set[str] | None = None,
    vocabulary: list[HskVocabularyEntry] | None = None,
    *,
    user_id: str | None = None,
) -> HskLevelStatus:
    """Return Home-page HSK progress from known characters and HSK vocabulary.

    ``user_id`` is required unless ``known_characters`` is supplied: the
    learner's vocabulary is private, the HSK reference data is shared.
    """
    if known_characters is None:
        if user_id is None:
            raise ValueError("user_id is required to read the learner's characters")
        known_characters = {
            row.char for row in Character.query.filter_by(user_id=user_id).all()
        }
    if vocabulary is None:
        vocabulary = list(HskCharacter.query.all())

    current_level: int | None = None
    for level in range(1, HSK_MAX_LEVEL + 1):
        if not _is_level_complete(known_characters, vocabulary, level):
            break
        current_level = level

    if current_level == HSK_MAX_LEVEL:
        return {
            "current_level": HSK_MAX_LEVEL,
            "next_level": None,
            "characters_to_next_level": None,
            "progress_to_next_level": 100.0,
            "missing_characters": [],
            "max_level": HSK_MAX_LEVEL,
            "completion_ratio": HSK_LEVEL_COMPLETION_RATIO,
        }

    next_level = 1 if current_level is None else current_level + 1
    required = _entries_up_to_level(vocabulary, next_level)
    target_known = _required_known_count(len(required))
    missing_entries = sorted(
        (entry for entry in required if entry.character not in known_characters),
        key=lambda entry: entry.frequency,
    )
    missing_characters = [entry.character for entry in missing_entries]
    known_for_next = len(required) - len(missing_characters)
    characters_to_next_level = max(0, target_known - known_for_next)

    return {
        "current_level": current_level,
        "next_level": next_level,
        "characters_to_next_level": characters_to_next_level,
        "progress_to_next_level": (
            0.0
            if target_known == 0
            else min(100.0, (known_for_next / target_known) * 100)
        ),
        "missing_characters": missing_characters,
        "max_level": HSK_MAX_LEVEL,
        "completion_ratio": HSK_LEVEL_COMPLETION_RATIO,
    }


def compute_current_hsk_level(
    known_characters: set[str] | None = None,
    vocabulary: list[HskVocabularyEntry] | None = None,
    *,
    user_id: str | None = None,
) -> int | None:
    """Return the highest completed HSK level, or None if HSK 1 is incomplete."""
    return get_hsk_level_status(
        known_characters,
        vocabulary,
        user_id=user_id,
    )["current_level"]


def refresh_current_hsk_level(user_id: str, *, commit: bool = True) -> int | None:
    """Recompute the learner's HSK level and persist it in their settings."""
    level = compute_current_hsk_level(user_id=user_id)
    set_level(user_id, level, commit=commit)
    if level is not None:
        for challenge_scenario, required_level in AUTO_COMPLETE_CHALLENGE_AT_LEVEL.items():
            if level >= required_level:
                mark_challenge_completed(user_id, challenge_scenario, commit=commit)
    return level


def get_stored_current_hsk_level(user_id: str) -> int | None:
    return get_level(user_id)


def speaking_hsk_level_from_current(current_level: int | None) -> int:
    """Chat agents speak one level above the completed level (capped at max)."""
    if current_level is None:
        return 1
    return min(current_level + 1, HSK_MAX_LEVEL)


def get_chat_speaking_hsk_level(user_id: str) -> int:
    return speaking_hsk_level_from_current(get_stored_current_hsk_level(user_id))
