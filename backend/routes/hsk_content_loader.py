from sqlalchemy.dialects.postgresql import insert

from backend.chinese_validation import is_han_character
from backend.extensions import db
from backend.models import HskCharacter, HskWord, hsk_word_character
from backend.routes.hsk_source import load_complete_hsk_entries, words_by_new_level


def load_hsk_content(entries: list[dict] | None = None) -> dict[str, int]:
    """Load HSK words/characters/links from complete-hsk entries.

    When ``entries`` is omitted, downloads the upstream JSON from GitHub.
    Words and characters use INSERT … ON CONFLICT DO NOTHING so the first
    (lowest) level wins.
    Returns the number of words processed per level.

    HSK content is shared by every user; per-user HSK levels are recomputed
    when that user's own characters change.
    """
    if entries is None:
        entries = load_complete_hsk_entries()

    processed_by_level: dict[str, int] = {}

    for level, words in enumerate(words_by_new_level(entries), start=1):
        for word, frequency in words:
            for char in word:
                if not is_han_character(char):
                    raise ValueError(f"Invalid character in word {word!r}: {char!r}")

            db.session.execute(
                insert(HskWord)
                .values(word=word, level=level, frequency=frequency)
                .on_conflict_do_nothing(index_elements=["word"])
            )

            seen_in_word: set[str] = set()
            for char in word:
                if char in seen_in_word:
                    continue
                seen_in_word.add(char)

                db.session.execute(
                    insert(HskCharacter)
                    .values(character=char, level=level, frequency=frequency)
                    .on_conflict_do_nothing(index_elements=["character"])
                )
                db.session.execute(
                    insert(hsk_word_character)
                    .values(word=word, character=char)
                    .on_conflict_do_nothing(index_elements=["word", "character"])
                )

        db.session.commit()
        processed_by_level[f"hsk-{level}"] = len(words)

    return processed_by_level


def reload_hsk_content(entries: list[dict] | None = None) -> dict[str, int]:
    """Clear HSK word/character tables and reload them from complete-hsk data."""
    db.session.execute(hsk_word_character.delete())
    HskWord.query.delete()
    HskCharacter.query.delete()
    db.session.commit()
    return load_hsk_content(entries)
