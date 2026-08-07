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
        "pinyin_readings": character.pinyin_readings,
        "writing_known": character.writing_known,
        "updated_at": character.updated_at.isoformat(),
    }


def _valid_reading_at(tokens: list[str], index: int) -> str | None:
    if index >= len(tokens):
        return None
    token = tokens[index].strip()
    if token == "" or len(token) > PINYIN_MAX_LENGTH:
        return None
    normalized = normalize_anki_pinyin_token(token)
    if normalized is None or len(normalized) > PINYIN_MAX_LENGTH:
        return None
    return normalized


_PINYIN_START_CHARS = frozenset("abcdefghijklmnopqrstuvwxyzü")


def extract_tone_syllables_in_order(text: str, count: int) -> list[str] | None:
    """Scan ``text`` for up to ``count`` pinyin syllables, in order.

    Mirrors the frontend's ``extractToneSyllablesInOrder``: a syllable is
    lowercase (tone digit optional -- neutral-tone particles like "le" and
    "ma" are common); anything else -- letters, digits, punctuation,
    whitespace -- is skipped. Used to pull each Han character's pinyin out
    of a word's pinyin field when that field also holds non-Han filler
    (parentheses, ellipses, question marks, ...) that doesn't need to line
    up positionally with real characters.

    ponytail: requiring the scan to start on a lowercase letter keeps a
    stray placeholder like "A" from being mistaken for the bare pinyin
    final "a"; a pinyin-shaped substring hiding inside longer filler can
    still false-match, which is acceptable since the filler itself is
    intentionally unchecked.
    """
    matches: list[str] = []
    i = 0
    n = len(text)
    while i < n and len(matches) < count:
        if text[i] not in _PINYIN_START_CHARS:
            i += 1
            continue
        matched_length = 0
        for length in range(min(PINYIN_MAX_LENGTH, n - i), 0, -1):
            candidate = text[i : i + length]
            # Reject a candidate that only validates because is_valid_pinyin
            # trims it internally (e.g. "hao3 " -> "hao3"); the exact span
            # must already be clean so a trailing space on a longer
            # candidate can't shadow a clean, shorter match.
            if candidate[-1].isspace():
                continue
            if is_valid_pinyin(candidate):
                matched_length = length
                break
        if matched_length > 0:
            matches.append(text[i : i + matched_length])
            i += matched_length
        else:
            i += 1
    return matches if len(matches) == count else None


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


def _resolved_word_tokens(
    word_text: str,
    pinyin_field: str,
    guess_map: dict[str, str],
) -> list[str | None]:
    """Resolve one token per character: literal for non-Han, syllable for Han.

    A Han syllable comes from the index-aligned field token, then the
    Anki-paired token, then ``guess_map`` (the HSK master reading, mirroring
    `AddWordModal`'s fallback). ``None`` marks a position that couldn't be
    resolved. When ``pinyin_field`` is blank there are no field tokens to
    align against, so non-Han characters pass through as their own literal.

    A word mixed with non-Han characters (parentheses, ellipses, question
    marks, ...) tries `extract_tone_syllables_in_order` first instead: real
    Anki fields routinely glue that punctuation directly onto the
    neighboring syllable ("...hao3", "(gong1)"), which breaks the
    index-aligned/literal-match rule below since it expects the field's
    whitespace layout to mirror the word's non-Han positions. Only falls
    through to the index-aligned rule when the scan can't fully resolve
    (e.g. a genuinely new character needing a guess).
    """
    field_blank = pinyin_field.strip() == ""

    if not field_blank and any(not is_han_character(char) for char in word_text):
        han_chars = [char for char in word_text if is_han_character(char)]
        scanned = extract_tone_syllables_in_order(pinyin_field, len(han_chars))
        if scanned is not None:
            resolved: list[str | None] = []
            han_index = 0
            for char in word_text:
                if is_han_character(char):
                    resolved.append(scanned[han_index])
                    han_index += 1
                else:
                    resolved.append(char)
            return resolved

    raw_tokens = pinyin_field.split()
    anki_by_char = dict(
        pair_han_characters_with_anki_pinyin_tokens(word_text, pinyin_field)
    )
    resolved: list[str | None] = []

    for index, char in enumerate(word_text):
        if not is_han_character(char):
            if field_blank:
                resolved.append(char)
                continue
            literal = raw_tokens[index] if index < len(raw_tokens) else ""
            resolved.append(char if literal == char else None)
            continue

        reading = None if field_blank else _valid_reading_at(raw_tokens, index)
        if reading is None:
            anki_reading = anki_by_char.get(char)
            if anki_reading is not None and len(anki_reading) <= PINYIN_MAX_LENGTH:
                reading = anki_reading
            else:
                guessed_raw = guess_map.get(char)
                if guessed_raw is not None:
                    guessed = normalize_anki_pinyin_token(guessed_raw)
                    if guessed is not None and len(guessed) <= PINYIN_MAX_LENGTH:
                        reading = guessed
        resolved.append(reading)

    return resolved


def build_word_pinyin_for_storage(
    word_text: str,
    pinyin_field: str,
    guesses: dict[str, str] | None = None,
) -> str | None:
    """Build a stored pinyin string with one token per character.

    Returns ``None`` when a character can't be resolved (index-aligned
    token, Anki token, or guess) -- including when ``pinyin_field`` is blank
    and no guess covers a Han character.
    """
    resolved = _resolved_word_tokens(word_text, pinyin_field, guesses or {})
    if any(token is None for token in resolved):
        return None
    return " ".join(resolved)  # type: ignore[arg-type]


def unresolved_word_characters(
    word_text: str,
    pinyin_field: str,
    guesses: dict[str, str] | None = None,
) -> list[str]:
    """Han characters in ``word_text`` whose pinyin couldn't be resolved."""
    resolved = _resolved_word_tokens(word_text, pinyin_field, guesses or {})
    seen: set[str] = set()
    missing: list[str] = []
    for char, token in zip(word_text, resolved):
        if token is not None or not is_han_character(char) or char in seen:
            continue
        seen.add(char)
        missing.append(char)
    return missing


def build_character_pinyin_map_from_words(words: list[Word]) -> dict[str, list[str]]:
    """Derive unique pinyin readings per Han character from word rows.

    Words are processed in ``(updated_at, word)`` order. Within each word,
    characters are scanned left to right; the first occurrence of each Han
    character picks its syllable. A word made entirely of Han characters
    uses the syllable at the same index in the space-separated pinyin field
    (matching the frontend ``isWordPinyinValid`` rules); a word mixed with
    non-Han characters instead resolves each Han character's syllable via
    ``extract_tone_syllables_in_order``, since the field's spacing and
    non-Han content aren't required to line up positionally there.
    """
    char_readings: dict[str, list[str]] = {}
    ordered_words = sorted(words, key=lambda row: (row.updated_at, row.word))

    for word in ordered_words:
        pinyin_field = word.pinyin or ""
        han_chars = [char for char in word.word if is_han_character(char)]
        has_non_han = len(han_chars) < len(word.word)

        if has_non_han:
            han_readings = extract_tone_syllables_in_order(
                pinyin_field, len(han_chars)
            )
        else:
            tokens = pinyin_field.split()
            han_readings = [
                _valid_reading_at(tokens, index) for index in range(len(han_chars))
            ]

        seen_in_word: set[str] = set()
        han_index = 0

        for char in word.word:
            if not is_han_character(char):
                continue
            reading = han_readings[han_index] if han_readings is not None else None
            han_index += 1
            if char in seen_in_word:
                continue
            seen_in_word.add(char)
            char_readings.setdefault(char, [])

            if reading is not None and reading not in char_readings[char]:
                char_readings[char].append(reading)

    return char_readings


def build_character_writing_known_map_from_words(words: list[Word]) -> dict[str, bool]:
    """A character is writing_known if any word containing it is writing_known."""
    known: dict[str, bool] = {}
    for word in words:
        for char in word.word:
            if not is_han_character(char):
                continue
            known[char] = known.get(char, False) or word.writing_known
    return known


def rebuild_characters_from_words(user_id) -> CharacterSyncResult:
    """Synchronize ``character`` rows with all ``words`` for ``user_id``.

    ``words`` is the source of truth: both ``pinyin_readings`` and
    ``writing_known`` are fully derived here, in either direction (a
    character reverts to not-writing-known once no remaining word marks it
    known).

    Returns the characters that were created or modified (i.e. whose
    ``updated_at`` changed) and the ids of any characters deleted.
    """
    words = Word.query.filter_by(user_id=user_id).all()
    target = build_character_pinyin_map_from_words(words)
    writing_known_map = build_character_writing_known_map_from_words(words)

    existing = {
        row.char: row for row in Character.query.filter_by(user_id=user_id).all()
    }
    updated_characters: list[Character] = []
    now = utcnow()

    for char, readings in target.items():
        record = existing.get(char)
        writing_known = writing_known_map.get(char, False)
        if record is None:
            record = Character(
                user_id=user_id,
                char=char,
                pinyin_readings=readings,
                writing_known=writing_known,
                updated_at=now,
            )
            db.session.add(record)
            updated_characters.append(record)
            continue

        changed = False
        if record.pinyin_readings != readings:
            record.pinyin_readings = readings
            changed = True

        if record.writing_known != writing_known:
            record.writing_known = writing_known
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
