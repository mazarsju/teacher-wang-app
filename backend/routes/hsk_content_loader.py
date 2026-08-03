from sqlalchemy.dialects.postgresql import insert

from backend.chinese_validation import is_han_character
from backend.extensions import db
from backend.hsk_level_corrections import corrected_hsk_level
from backend.models import HskCharacter, HskWord, hsk_word_character
from backend.routes.hsk_source import HskWordForm, load_complete_hsk_entries, words_by_new_level


def _forms_with_effective_levels(
    entries: list[dict],
) -> list[tuple[int, HskWordForm]]:
    """Flatten forms and apply multi-reading level overrides.

    Sorted by effective level ascending so INSERT … ON CONFLICT DO NOTHING
    keeps the lowest corrected level for words and characters.
    """
    rows: list[tuple[int, HskWordForm]] = []
    for source_level, forms in enumerate(words_by_new_level(entries), start=1):
        for form in forms:
            effective = corrected_hsk_level(form.word, form.pinyin, source_level)
            rows.append((effective, form))
    rows.sort(key=lambda item: (item[0], item[1].frequency, item[1].word, item[1].pinyin))
    return rows


def load_hsk_content(entries: list[dict] | None = None) -> dict[str, int]:
    """Load HSK words/characters/links from complete-hsk entries.

    When ``entries`` is omitted, downloads the upstream JSON from GitHub.
    Each distinct pinyin form becomes its own ``hsk_words`` row
    (id = word|pinyin). Multi-reading level overrides from
    ``hsk_level_corrections`` are applied before insert.
    Words and characters use INSERT … ON CONFLICT DO NOTHING so the first
    (lowest effective) level wins for a given id / character.
    Returns the number of word forms processed per effective level.

    HSK content is shared by every user; per-user HSK levels are recomputed
    when that user's own characters change.
    """
    if entries is None:
        entries = load_complete_hsk_entries()

    processed_by_level: dict[str, int] = {f"hsk-{level}": 0 for level in range(1, 8)}

    for level, form in _forms_with_effective_levels(entries):
        for char in form.word:
            if not is_han_character(char):
                raise ValueError(
                    f"Invalid character in word {form.word!r}: {char!r}"
                )

        db.session.execute(
            insert(HskWord)
            .values(
                id=form.id,
                word=form.word,
                level=level,
                frequency=form.frequency,
                pinyin=form.pinyin,
                definition=form.definition,
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )

        seen_in_word: set[str] = set()
        for char in form.word:
            if char in seen_in_word:
                continue
            seen_in_word.add(char)

            db.session.execute(
                insert(HskCharacter)
                .values(
                    character=char,
                    level=level,
                    frequency=form.frequency,
                )
                .on_conflict_do_nothing(index_elements=["character"])
            )
            db.session.execute(
                insert(hsk_word_character)
                .values(word_id=form.id, character=char)
                .on_conflict_do_nothing(index_elements=["word_id", "character"])
            )

        processed_by_level[f"hsk-{level}"] += 1

    db.session.commit()
    return processed_by_level


def reload_hsk_content(entries: list[dict] | None = None) -> dict[str, int]:
    """Clear HSK word/character tables and reload them from complete-hsk data."""
    db.session.execute(hsk_word_character.delete())
    HskWord.query.delete()
    HskCharacter.query.delete()
    db.session.commit()
    return load_hsk_content(entries)
