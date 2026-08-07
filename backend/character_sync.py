"""Rebuild per-user character rows from the words table."""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.chinese_validation import is_han_character
from backend.extensions import db
from backend.models import Character, Word, utcnow
from backend.pinyin import is_valid_pinyin, normalize_anki_pinyin_token

PINYIN_MAX_LENGTH = 8


@dataclass
class CharacterSyncResult:
    """Character rows touched by a ``rebuild_characters_from_words`` call.

    Lets callers push incremental updates to the frontend store instead of
    forcing a full character list refetch after every word change.
    """

    updated_characters: list[Character] = field(default_factory=list)
    deleted_char_ids: list[str] = field(default_factory=list)


def serialize_character(character: Character) -> dict:
    return {
        "char": character.char,
        "pinyin": character.pinyin,
        "writting_known": character.writting_known,
        "updated_at": character.updated_at.isoformat(),
    }


def _valid_reading_at(tokens: list[str], index: int) -> str | None:
    if index >= len(tokens):
        return None
    token = tokens[index].strip()
    if token == "" or len(token) > PINYIN_MAX_LENGTH:
        return None
    if not is_valid_pinyin(token):
        return None
    return token


def pair_han_characters_with_anki_pinyin_tokens(
    word_text: str,
    pinyin_field: str,
) -> list[tuple[str, str | None]]:
    """Pair each Han character with an Anki-style syllable token."""
    tokens = [token for token in pinyin_field.split() if token]
    pairs: list[tuple[str, str | None]] = []
    token_idx = 0
    for char in word_text:
        if not is_han_character(char):
            continue
        raw = tokens[token_idx] if token_idx < len(tokens) else ""
        token_idx += 1
        normalized = normalize_anki_pinyin_token(raw) if raw else None
        pairs.append((char, normalized))
    return pairs


def build_word_pinyin_for_storage(
    word_text: str,
    pinyin_field: str,
    guesses: dict[str, str] | None = None,
) -> str | None:
    """Build a stored pinyin string with one token per character.

    Returns ``None`` when ``pinyin_field`` is non-empty but a Han character
    cannot be assigned a valid syllable (index-aligned token, Anki token, or
    guess). Returns an empty string when ``pinyin_field`` is blank.
    """
    if pinyin_field.strip() == "":
        return ""

    guess_map = guesses or {}
    raw_tokens = pinyin_field.split()
    anki_by_char = dict(
        pair_han_characters_with_anki_pinyin_tokens(word_text, pinyin_field)
    )
    tokens: list[str] = []

    for index, char in enumerate(word_text):
        if not is_han_character(char):
            literal = raw_tokens[index] if index < len(raw_tokens) else ""
            if literal != char:
                return None
            tokens.append(char)
            continue

        reading = _valid_reading_at(raw_tokens, index)
        if reading is None:
            anki_reading = anki_by_char.get(char)
            if (
                anki_reading is not None
                and len(anki_reading) <= PINYIN_MAX_LENGTH
                and is_valid_pinyin(anki_reading)
            ):
                reading = anki_reading
            else:
                guessed = guess_map.get(char)
                if (
                    guessed is not None
                    and len(guessed) <= PINYIN_MAX_LENGTH
                    and is_valid_pinyin(guessed)
                ):
                    reading = guessed

        if reading is None:
            return None
        tokens.append(reading)

    return " ".join(tokens)


def build_character_pinyin_map_from_words(words: list[Word]) -> dict[str, list[str]]:
    """Derive unique pinyin readings per Han character from word rows.

    Words are processed in ``(updated_at, word)`` order. Within each word,
    characters are scanned left to right; the first occurrence of each Han
    character picks the syllable at the same index in the word's pinyin field
    (one space-separated token per character, matching the frontend
    ``isWordPinyinValid`` rules).
    """
    char_readings: dict[str, list[str]] = {}
    ordered_words = sorted(words, key=lambda row: (row.updated_at, row.word))

    for word in ordered_words:
        tokens = (word.pinyin or "").split()
        seen_in_word: set[str] = set()

        for index, char in enumerate(word.word):
            if not is_han_character(char):
                continue
            if char in seen_in_word:
                continue
            seen_in_word.add(char)
            char_readings.setdefault(char, [])

            reading = _valid_reading_at(tokens, index)
            if reading is not None and reading not in char_readings[char]:
                char_readings[char].append(reading)

    return char_readings


def build_character_writting_known_map_from_words(words: list[Word]) -> dict[str, bool]:
    """A character is writting_known if any word containing it is writting_known."""
    known: dict[str, bool] = {}
    for word in words:
        for char in word.word:
            if not is_han_character(char):
                continue
            known[char] = known.get(char, False) or word.writting_known
    return known


def rebuild_characters_from_words(user_id) -> CharacterSyncResult:
    """Synchronize ``character`` rows with all ``words`` for ``user_id``.

    Returns the characters that were created or modified (i.e. whose
    ``updated_at`` changed) and the ids of any characters deleted.
    """
    words = Word.query.filter_by(user_id=user_id).all()
    target = build_character_pinyin_map_from_words(words)
    writting_known_map = build_character_writting_known_map_from_words(words)

    existing = {
        row.char: row for row in Character.query.filter_by(user_id=user_id).all()
    }
    updated_characters: list[Character] = []
    now = utcnow()

    for char, readings in target.items():
        record = existing.get(char)
        if record is None:
            record = Character(
                user_id=user_id,
                char=char,
                pinyin_readings=readings,
                writting_known=writting_known_map.get(char, False),
                synchronized=False,
                updated_at=now,
            )
            db.session.add(record)
            updated_characters.append(record)
            continue

        changed = False
        if record.pinyin_readings != readings:
            record.pinyin_readings = readings
            changed = True

        if writting_known_map.get(char, False) and not record.writting_known:
            record.writting_known = True
            changed = True

        if changed:
            updated_characters.append(record)

    deleted_char_ids = [char for char in existing if char not in target]
    for char in deleted_char_ids:
        db.session.delete(existing[char])

    db.session.flush()
    return CharacterSyncResult(
        updated_characters=updated_characters,
        deleted_char_ids=deleted_char_ids,
    )


def fill_missing_word_pinyin_from_characters(user_id) -> None:
    """Backfill empty word pinyin from existing character primary readings."""
    char_pinyin = {
        row.char: row.pinyin
        for row in Character.query.filter_by(user_id=user_id).all()
        if row.pinyin
    }
    for word in Word.query.filter_by(user_id=user_id).all():
        if word.pinyin:
            continue
        tokens: list[str] = []
        for char in word.word:
            if is_han_character(char):
                tokens.append(char_pinyin.get(char, "??"))
            else:
                tokens.append(char)
        word.pinyin = " ".join(tokens)
