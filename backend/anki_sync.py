"""Anki deck mapping status and setup helpers."""

from __future__ import annotations

import json
from typing import Any, Literal

from backend import anki_connect
from backend.chinese_validation import is_han_character
from backend.extensions import db
from backend.models import Character, IgnoreVocabCard, IgnoreWrittingCard, Word, utcnow
from backend.pinyin import normalize_anki_pinyin_token
from backend.settings import (
    SETTING_ANKI_MANDARIN_VOCABULARY_DECK,
    SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS,
    SETTING_ANKI_MANDARIN_VOCABULARY_MODEL,
    SETTING_ANKI_MANDARIN_VOCABULARY_PULL_IGNORED,
    SETTING_ANKI_MANDARIN_WRITTING_DECK,
    SETTING_ANKI_MANDARIN_WRITTING_FIELDS,
    SETTING_ANKI_MANDARIN_WRITTING_MODEL,
    SETTING_ANKI_MANDARIN_WRITTING_PULL_IGNORED,
    SETTING_ANKI_SYNCHRONIZATION_STATUS,
    get_setting,
    set_setting,
)

DeckKind = Literal["mandarin_vocabulary", "mandarin_writting"]
DeckStatus = Literal["not_configured", "synchronized", "not_synchronized"]
OverallAnkiSynchronizationStatus = Literal["not_synchronized", "synchronized"]
SyncAction = Literal["synchronize_all", "cancel_all", "partial"]
SyncDirection = Literal["push", "pull"]

DECK_SETTING_KEYS: dict[DeckKind, str] = {
    "mandarin_vocabulary": SETTING_ANKI_MANDARIN_VOCABULARY_DECK,
    "mandarin_writting": SETTING_ANKI_MANDARIN_WRITTING_DECK,
}

MODEL_SETTING_KEYS: dict[DeckKind, str] = {
    "mandarin_vocabulary": SETTING_ANKI_MANDARIN_VOCABULARY_MODEL,
    "mandarin_writting": SETTING_ANKI_MANDARIN_WRITTING_MODEL,
}

FIELDS_SETTING_KEYS: dict[DeckKind, str] = {
    "mandarin_vocabulary": SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS,
    "mandarin_writting": SETTING_ANKI_MANDARIN_WRITTING_FIELDS,
}

REQUIRED_FIELDS: dict[DeckKind, tuple[str, ...]] = {
    "mandarin_writting": ("recto", "verso"),
    "mandarin_vocabulary": ("writting", "pinyin", "definition"),
}

VOCABULARY_MANDATORY_FIELDS = ("writting", "pinyin", "definition")

VOCABULARY_MODEL_CSS = """\
.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
.hanzi {
  font-size: 42px;
}
.extra-fields {
  margin-top: 1em;
  font-size: 16px;
  color: #444444;
}
"""


def _anki_field_ref(name: str) -> str:
    return "{{" + name + "}}"


def _optional_fields_html(optional_fields: list[str]) -> str:
    if not optional_fields:
        return ""
    lines = "<br>".join(_anki_field_ref(name) for name in optional_fields)
    return f'<div class="extra-fields">{lines}</div>'


def build_vocabulary_card_templates(optional_fields: list[str]) -> list[dict[str, str]]:
    extras = _optional_fields_html(optional_fields)
    writting = _anki_field_ref("writting")
    pinyin = _anki_field_ref("pinyin")
    definition = _anki_field_ref("definition")

    return [
        {
            "Name": "Writting → Pinyin + Definition",
            "Front": f'<div class="hanzi">{writting}</div>',
            "Back": (
                "{{FrontSide}}<hr id=answer>"
                f"{pinyin}<br>{definition}{extras}"
            ),
        },
        {
            "Name": "Pinyin → Writting + Definition",
            "Front": pinyin,
            "Back": (
                "{{FrontSide}}<hr id=answer>"
                f'<div class="hanzi">{writting}</div><br>{definition}{extras}'
            ),
        },
        {
            "Name": "Definition → Writting + Pinyin",
            "Front": definition,
            "Back": (
                "{{FrontSide}}<hr id=answer>"
                f'<div class="hanzi">{writting}</div><br>{pinyin}{extras}'
            ),
        },
    ]


def normalize_optional_fields(optional_fields: list[str] | None) -> list[str]:
    if optional_fields is None:
        return []
    if not isinstance(optional_fields, list):
        raise ValueError("optional_fields must be an array of strings")

    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in optional_fields:
        if not isinstance(raw, str):
            raise ValueError("optional_fields must be an array of strings")
        name = raw.strip()
        if name == "":
            continue
        if name in VOCABULARY_MANDATORY_FIELDS:
            raise ValueError(
                f'Optional field "{name}" conflicts with a mandatory field name.'
            )
        lowered = name.casefold()
        if lowered in seen:
            raise ValueError(f'Duplicate optional field "{name}".')
        seen.add(lowered)
        cleaned.append(name)
    return cleaned


def create_vocabulary_three_direction_setup(
    *,
    deck_name: str,
    model_name: str,
    optional_fields: list[str] | None = None,
) -> dict[str, Any]:
    trimmed_deck = deck_name.strip()
    trimmed_model = model_name.strip()
    if trimmed_deck == "":
        raise ValueError("deck_name must be a non-empty string")
    if trimmed_model == "":
        raise ValueError("model_name must be a non-empty string")

    extras = normalize_optional_fields(optional_fields)
    field_names = [*VOCABULARY_MANDATORY_FIELDS, *extras]

    existing_models = anki_connect.model_names()
    if trimmed_model in existing_models:
        raise ValueError(f'Note type "{trimmed_model}" already exists in Anki.')

    anki_connect.create_model(
        model_name=trimmed_model,
        fields=field_names,
        card_templates=build_vocabulary_card_templates(extras),
        css=VOCABULARY_MODEL_CSS,
    )
    anki_connect.create_deck(trimmed_deck)

    # Create only — the UI pre-fills the setup form so the user can save mapping.
    return {
        "status": "not_configured",
        "deck_name": trimmed_deck,
        "model_name": trimmed_model,
        "fields": {
            "writting": "writting",
            "pinyin": "pinyin",
            "definition": "definition",
        },
    }


def _parse_fields(raw: str) -> dict[str, str]:
    if raw.strip() == "":
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        str(key): str(value)
        for key, value in data.items()
        if isinstance(key, str) and isinstance(value, str)
    }


def _fields_complete(kind: DeckKind, fields: dict[str, str]) -> bool:
    return all(fields.get(key, "").strip() != "" for key in REQUIRED_FIELDS[kind])


def _pending_vocabulary_words() -> list[Word]:
    return (
        Word.query.filter_by(synchronized=False)
        .order_by(Word.word)
        .all()
    )


def _pending_writting_characters() -> list[Character]:
    return (
        Character.query.filter_by(writting_known=True, synchronized=False)
        .order_by(Character.char)
        .all()
    )


def _vocabulary_card_pinyin(word_text: str) -> str:
    """Build pinyin for a word, keeping unrecognized characters as-is.

    Recognized characters become their pinyin, separated by spaces.
    Characters missing from the character table (e.g. punctuation) are kept
    literally with no surrounding spaces, e.g. ``除了。。以外。。`` →
    ``chu2 le。。yi3 wai4。。``.
    """
    pieces: list[str] = []
    last_was_pinyin = False
    for char in word_text:
        character = Character.query.filter_by(char=char).first()
        if character is not None:
            if last_was_pinyin:
                pieces.append(" ")
            pieces.append(character.pinyin)
            last_was_pinyin = True
        else:
            pieces.append(char)
            last_was_pinyin = False
    return "".join(pieces)


def vocabulary_card_from_word(word: Word) -> dict[str, str]:
    return {
        "id": word.word,
        "writting": word.word,
        "pinyin": _vocabulary_card_pinyin(word.word),
        "definition": word.definition or "",
    }


def _is_word_eligible_for_writting(word: Word) -> bool:
    if word.definition is None or word.definition.strip() == "":
        return False
    for char in word.word:
        character = Character.query.filter_by(char=char).first()
        if character is None or not character.writting_known:
            return False
    return True


def _find_writting_word_for_character(character: Character) -> Word | None:
    candidates = [
        word for word in character.words if _is_word_eligible_for_writting(word)
    ]
    if not candidates:
        return None
    # Prefer the character itself as a one-char word, then shortest, then alpha.
    candidates.sort(
        key=lambda word: (
            0 if word.word == character.char else 1,
            len(word.word),
            word.word,
        )
    )
    return candidates[0]


def writting_card_from_character(character: Character) -> dict[str, str] | None:
    word = _find_writting_word_for_character(character)
    if word is None:
        return None
    definition = (word.definition or "").strip()
    pinyin = _vocabulary_card_pinyin(word.word)
    recto = f"{definition} ({pinyin})"
    return {
        # Unique by recto so multi-char words appear once in the sync list.
        "id": recto,
        "recto": recto,
        "verso": word.word,
    }


def _verso_significant_part(verso: str) -> str:
    """Keep only the part before the first '-' (Anki annotations after are ignored)."""
    return verso.split("-", 1)[0]


def _character_ids_from_verso(verso: str) -> list[str]:
    significant = _verso_significant_part(verso)
    return [char for char in significant if is_han_character(char)]


def _character_ids_from_writting_cards(cards: list[dict[str, str]]) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for card in cards:
        for char_id in _character_ids_from_verso(card["verso"]):
            if char_id in seen:
                continue
            seen.add(char_id)
            ids.append(char_id)
    return ids


def _significant_anki_versos(versos: set[str]) -> set[str]:
    return {
        part.strip()
        for part in (_verso_significant_part(verso) for verso in versos)
        if part.strip() != ""
    }


def _pending_count_for_kind(kind: DeckKind) -> int:
    if kind == "mandarin_vocabulary":
        return Word.query.filter_by(synchronized=False).count()
    if kind == "mandarin_writting":
        return Character.query.filter_by(
            writting_known=True,
            synchronized=False,
        ).count()
    return 0


def _pending_pull_count_for_kind(kind: DeckKind, mapping: dict[str, Any]) -> int:
    """Count Anki cards that would appear in the sync modal pull list."""
    if kind == "mandarin_vocabulary":
        writting_field = mapping["fields"].get("writting", "").strip()
        pinyin_field = mapping["fields"].get("pinyin", "").strip()
        definition_field = mapping["fields"].get("definition", "").strip()
        if writting_field == "" or pinyin_field == "" or definition_field == "":
            return 0
        notes = anki_connect.mapped_notes_in_deck(
            mapping["deck_name"],
            {
                "writting": writting_field,
                "pinyin": pinyin_field,
                "definition": definition_field,
            },
        )
        pull_cards, pull_missing = _vocabulary_pull_cards_from_notes(notes)
        return len(pull_cards) + len(pull_missing)

    if kind == "mandarin_writting":
        recto_field = mapping["fields"].get("recto", "").strip()
        verso_field = mapping["fields"].get("verso", "").strip()
        if recto_field == "" or verso_field == "":
            return 0
        notes = anki_connect.mapped_notes_in_deck(
            mapping["deck_name"],
            {
                "recto": recto_field,
                "verso": verso_field,
            },
        )
        pull_cards, missing, _warning_rectos = _writting_pull_from_notes(notes)
        return len(pull_cards) + len(missing)

    return 0


def deck_status_for_mapping(
    deck_name: str,
    model_name: str,
    fields: dict[str, str],
    kind: DeckKind,
    *,
    pull_count: int | None = None,
) -> DeckStatus:
    if (
        deck_name.strip() == ""
        or model_name.strip() == ""
        or not _fields_complete(kind, fields)
    ):
        return "not_configured"
    if _pending_count_for_kind(kind) > 0:
        return "not_synchronized"
    if pull_count is not None and pull_count > 0:
        return "not_synchronized"
    return "synchronized"


def status_from_sync_counts(
    *,
    configured: bool,
    push_count: int,
    pull_count: int,
    unsyncable_count: int = 0,
) -> DeckStatus:
    """Status from the same push/pull counts shown in the sync modal."""
    if not configured:
        return "not_configured"
    if push_count > 0 or pull_count > 0 or unsyncable_count > 0:
        return "not_synchronized"
    return "synchronized"


def get_overall_anki_synchronization_status() -> OverallAnkiSynchronizationStatus:
    raw = get_setting(SETTING_ANKI_SYNCHRONIZATION_STATUS, "not_synchronized")
    if raw == "synchronized":
        return "synchronized"
    return "not_synchronized"


def pending_anki_push_estimate() -> int:
    """Estimate of local records that still need an Anki push card."""
    return _pending_count_for_kind("mandarin_vocabulary") + _pending_count_for_kind(
        "mandarin_writting"
    )


def maybe_promote_overall_anki_synchronization(
    *,
    vocabulary_status: DeckStatus | None = None,
    writting_status: DeckStatus | None = None,
    check_pull: bool = True,
) -> OverallAnkiSynchronizationStatus:
    """Promote overall status to synchronized once both decks are synchronized.

    The overall status is sticky: after the first complete synchronization it
    stays ``synchronized`` even if new local cards are added later.
    """
    current = get_overall_anki_synchronization_status()
    if current == "synchronized":
        return current

    vocab_status = vocabulary_status
    if vocab_status is None:
        vocab_status = get_deck_mapping(
            "mandarin_vocabulary",
            check_pull=check_pull,
        )["status"]
    write_status = writting_status
    if write_status is None:
        write_status = get_deck_mapping(
            "mandarin_writting",
            check_pull=check_pull,
        )["status"]

    if vocab_status == "synchronized" and write_status == "synchronized":
        set_setting(
            SETTING_ANKI_SYNCHRONIZATION_STATUS,
            "synchronized",
            commit=True,
        )
        return "synchronized"
    return current


def _parse_string_list_setting(raw: str) -> list[str]:
    if raw.strip() == "":
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [str(item) for item in data if isinstance(item, str) and item.strip() != ""]


def _migrate_pull_ignored_settings_to_tables() -> None:
    """One-time copy of legacy JSON ignore settings into ignore_* tables."""
    vocab_raw = get_setting(SETTING_ANKI_MANDARIN_VOCABULARY_PULL_IGNORED, "[]")
    for writting in _parse_string_list_setting(vocab_raw):
        if IgnoreVocabCard.query.filter_by(writting=writting).first() is None:
            db.session.add(IgnoreVocabCard(writting=writting))
    writting_raw = get_setting(SETTING_ANKI_MANDARIN_WRITTING_PULL_IGNORED, "[]")
    for recto in _parse_string_list_setting(writting_raw):
        if IgnoreWrittingCard.query.filter_by(recto=recto).first() is None:
            db.session.add(IgnoreWrittingCard(recto=recto))
    db.session.commit()


def _get_vocabulary_pull_ignored() -> set[str]:
    return {
        row.writting
        for row in IgnoreVocabCard.query.with_entities(IgnoreVocabCard.writting).all()
    }


def _add_vocabulary_pull_ignored(writtings: list[str]) -> int:
    added = 0
    for writting in writtings:
        key = writting.strip()
        if key == "":
            continue
        if IgnoreVocabCard.query.filter_by(writting=key).first() is not None:
            continue
        db.session.add(IgnoreVocabCard(writting=key))
        added += 1
    if added:
        db.session.commit()
    return added


def _get_writting_pull_ignored() -> set[str]:
    return {
        row.recto
        for row in IgnoreWrittingCard.query.with_entities(IgnoreWrittingCard.recto).all()
    }


def _add_writting_pull_ignored(rectos: list[str]) -> int:
    added = 0
    for recto in rectos:
        key = recto.strip()
        if key == "":
            continue
        if IgnoreWrittingCard.query.filter_by(recto=key).first() is not None:
            continue
        db.session.add(IgnoreWrittingCard(recto=key))
        added += 1
    if added:
        db.session.commit()
    return added


def _writting_anki_notes(mapping: dict[str, Any]) -> list[dict[str, str]]:
    recto_field = mapping["fields"].get("recto", "").strip()
    verso_field = mapping["fields"].get("verso", "").strip()
    if recto_field == "" or verso_field == "":
        raise ValueError("Mapped Anki writing fields are incomplete.")
    return anki_connect.mapped_notes_in_deck(
        mapping["deck_name"],
        {
            "recto": recto_field,
            "verso": verso_field,
        },
    )


def _writting_pull_from_notes(
    notes: list[dict[str, str]],
) -> tuple[list[dict[str, str]], list[str], list[str]]:
    """Build pullable writing characters, missing chars, and warning Anki rectos."""
    ignored = _get_writting_pull_ignored()
    pull_cards: list[dict[str, str]] = []
    missing: list[str] = []
    warning_rectos: list[str] = []
    seen_pull: set[str] = set()
    seen_missing: set[str] = set()
    seen_warning_recto: set[str] = set()

    for note in notes:
        recto = (note.get("recto") or "").strip()
        if recto == "" or recto in ignored:
            continue
        verso = _verso_significant_part(note.get("verso") or "")
        note_has_missing = False
        for char in verso:
            if not is_han_character(char):
                continue
            # Legacy settings migrated character ids into this table too.
            if char in ignored:
                continue
            record = Character.query.filter_by(char=char).first()
            if record is None:
                note_has_missing = True
                if char not in seen_missing:
                    seen_missing.add(char)
                    missing.append(char)
                continue
            if record.writting_known:
                continue
            if char in seen_pull:
                continue
            seen_pull.add(char)
            pull_cards.append(
                {
                    "id": char,
                    "recto": record.pinyin,
                    "verso": char,
                    "anki_recto": recto,
                }
            )
        if note_has_missing and recto not in seen_warning_recto:
            seen_warning_recto.add(recto)
            warning_rectos.append(recto)

    return pull_cards, missing, warning_rectos


def _import_writting_pull_card(card: dict[str, Any]) -> bool:
    char = str(card.get("id") or card.get("verso") or "").strip()
    if char == "" or not is_han_character(char):
        return False
    record = Character.query.filter_by(char=char).first()
    if record is None:
        return False
    now = utcnow()
    record.writting_known = True
    record.synchronized = True
    record.updated_at = now
    db.session.commit()
    return True


def _pair_writting_with_pinyin_tokens(
    word_text: str,
    pinyin_field: str,
) -> list[tuple[str, str | None]]:
    """Map each Han character in writting to a normalized pinyin token."""
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


def _build_pinyin_guess_map(notes: list[dict[str, str]]) -> dict[str, str]:
    """Guess character pinyin from any Anki note that has a non-empty pinyin field."""
    guesses: dict[str, str] = {}
    for note in notes:
        writting = (note.get("writting") or "").strip()
        pinyin_field = (note.get("pinyin") or "").strip()
        if writting == "" or pinyin_field == "":
            continue
        for char, pinyin in _pair_writting_with_pinyin_tokens(writting, pinyin_field):
            if pinyin is None or len(pinyin) > 6 or char in guesses:
                continue
            guesses[char] = pinyin
    return guesses


def _resolved_char_pinyin(
    card_pinyin: str | None,
    char: str,
    guesses: dict[str, str],
) -> str | None:
    if card_pinyin is not None and len(card_pinyin) <= 6:
        return card_pinyin
    guessed = guesses.get(char)
    if guessed is not None and len(guessed) <= 6:
        return guessed
    return None


def _characters_to_create_for_card(
    word_text: str,
    pinyin_field: str,
    guesses: dict[str, str] | None = None,
) -> list[str] | None:
    """Return chars that would be created, or None if the card cannot fully resolve.

    Empty Anki pinyin is allowed: the word card is still pullable. Missing
    characters are created when pinyin can be taken from the card itself or
    guessed from other cards in the deck.
    """
    guess_map = guesses or {}
    pinyin_blank = pinyin_field.strip() == ""
    to_create: list[str] = []
    for char, card_pinyin in _pair_writting_with_pinyin_tokens(word_text, pinyin_field):
        if Character.query.filter_by(char=char).first() is not None:
            continue
        pinyin = _resolved_char_pinyin(card_pinyin, char, guess_map)
        if pinyin is None:
            if pinyin_blank:
                # Cannot create this character yet; still allow pulling the word.
                continue
            return None
        to_create.append(char)
    return to_create


def _ensure_characters_from_pinyin(
    word_text: str,
    pinyin_field: str,
    guesses: dict[str, str] | None = None,
) -> list[str]:
    """Create missing characters from Anki pinyin. Returns created char ids."""
    guess_map = guesses or {}
    created: list[str] = []
    now = utcnow()
    for char, card_pinyin in _pair_writting_with_pinyin_tokens(word_text, pinyin_field):
        if Character.query.filter_by(char=char).first() is not None:
            continue
        pinyin = _resolved_char_pinyin(card_pinyin, char, guess_map)
        if pinyin is None:
            continue
        db.session.add(
            Character(
                char=char,
                pinyin=pinyin,
                writting_known=False,
                synchronized=True,
                updated_at=now,
            )
        )
        created.append(char)
    db.session.flush()
    return created


def _import_vocabulary_card(
    card: dict[str, Any],
    guesses: dict[str, str] | None = None,
) -> tuple[bool, int]:
    """Import one vocabulary card. Returns (word_created, characters_created)."""
    word_text = str(card.get("writting") or "").strip()
    han_chars = [char for char in word_text if is_han_character(char)]
    if word_text == "" or not han_chars or len(word_text) > 10:
        return False, 0
    if Word.query.filter_by(word=word_text).first() is not None:
        return False, 0

    definition = str(card.get("definition") or "").strip()[:100]
    pinyin_field = str(card.get("pinyin") or "")
    pinyin_blank = pinyin_field.strip() == ""
    created_chars = _ensure_characters_from_pinyin(
        word_text,
        pinyin_field,
        guesses,
    )

    missing = [
        char
        for char in word_text
        if is_han_character(char)
        and Character.query.filter_by(char=char).first() is None
    ]
    if missing and not pinyin_blank:
        # Roll back characters created for this failed word.
        for char in created_chars:
            record = Character.query.filter_by(char=char).first()
            if record is not None:
                db.session.delete(record)
        db.session.commit()
        return False, 0

    now = utcnow()
    word_record = Word(
        word=word_text,
        definition=definition or None,
        synchronized=True,
        updated_at=now,
    )
    db.session.add(word_record)
    for char in word_text:
        if not is_han_character(char):
            continue
        char_record = Character.query.filter_by(char=char).first()
        if char_record is None:
            continue
        if word_record not in char_record.words:
            char_record.words.append(word_record)
            char_record.updated_at = now
    db.session.commit()
    return True, len(created_chars)


def _unique_characters_to_create(cards: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for card in cards:
        for char in card.get("characters_to_create") or []:
            if not isinstance(char, str) or char in seen:
                continue
            seen.add(char)
            ordered.append(char)
    return ordered


def _vocabulary_pull_cards_from_notes(
    notes: list[dict[str, str]],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Return pullable vocab cards and writtings that cannot be pulled.

    Cards longer than 10 characters are auto-added to ignore_vocab_card.
    Warnings are only for cards that contain Han characters whose pinyin
    cannot be resolved from the deck. Mixed / punctuation content is allowed.
    """
    local_words = {row.word for row in Word.query.with_entities(Word.word).all()}
    ignored = _get_vocabulary_pull_ignored()
    guesses = _build_pinyin_guess_map(notes)
    cards: list[dict[str, Any]] = []
    missing: list[str] = []
    auto_ignore: list[str] = []
    seen: set[str] = set()
    seen_missing: set[str] = set()
    for note in notes:
        writting = (note.get("writting") or "").strip()
        if (
            writting == ""
            or writting in local_words
            or writting in ignored
            or writting in seen
            or writting in seen_missing
        ):
            continue
        if len(writting) > 10:
            auto_ignore.append(writting)
            continue
        han_chars = [char for char in writting if is_han_character(char)]
        if not han_chars:
            continue
        pinyin = (note.get("pinyin") or "").strip()
        characters_to_create = _characters_to_create_for_card(
            writting,
            pinyin,
            guesses,
        )
        if characters_to_create is None:
            seen_missing.add(writting)
            missing.append(writting)
            continue
        seen.add(writting)
        definition = (note.get("definition") or "").strip()[:100]
        cards.append(
            {
                "id": writting,
                "writting": writting,
                "pinyin": pinyin,
                "definition": definition,
                "characters_to_create": characters_to_create,
            }
        )
    if auto_ignore:
        _add_vocabulary_pull_ignored(auto_ignore)
    cards.sort(key=lambda card: str(card["writting"]))
    missing.sort()
    return cards, missing


def _vocabulary_anki_notes(mapping: dict[str, Any]) -> list[dict[str, str]]:
    writting_field = mapping["fields"].get("writting", "").strip()
    pinyin_field = mapping["fields"].get("pinyin", "").strip()
    definition_field = mapping["fields"].get("definition", "").strip()
    if writting_field == "" or pinyin_field == "" or definition_field == "":
        raise ValueError("Mapped Anki vocabulary fields are incomplete.")
    return anki_connect.mapped_notes_in_deck(
        mapping["deck_name"],
        {
            "writting": writting_field,
            "pinyin": pinyin_field,
            "definition": definition_field,
        },
    )


def _get_pending_vocabulary_sync(mapping: dict[str, Any]) -> dict[str, Any]:
    notes = _vocabulary_anki_notes(mapping)
    existing_writtings = {
        (note.get("writting") or "").strip()
        for note in notes
        if (note.get("writting") or "").strip() != ""
    }
    pull_cards, pull_missing = _vocabulary_pull_cards_from_notes(notes)
    pull_characters = _unique_characters_to_create(pull_cards)

    pending_words: list[Word] = []
    already_in_anki: list[str] = []
    for word in _pending_vocabulary_words():
        if word.word in existing_writtings:
            already_in_anki.append(word.word)
        else:
            pending_words.append(word)

    if already_in_anki:
        _mark_words_synchronized(already_in_anki)

    cards = [vocabulary_card_from_word(word) for word in pending_words]
    mapping = {
        **mapping,
        "status": status_from_sync_counts(
            configured=True,
            push_count=len(cards),
            pull_count=len(pull_cards) + len(pull_missing),
        ),
    }
    return {
        "kind": "mandarin_vocabulary",
        "count": len(cards),
        "cards": cards,
        "unsyncable": [],
        "pull_count": len(pull_cards) + len(pull_missing),
        "pull_cards": pull_cards,
        "pull_characters_to_create_count": len(pull_characters),
        "pull_missing": pull_missing,
        "deck": mapping,
    }


def _get_pending_writting_sync(mapping: dict[str, Any]) -> dict[str, Any]:
    verso_field = mapping["fields"].get("verso", "").strip()
    if verso_field == "":
        raise ValueError('Mapped Anki field for "verso" is missing.')

    notes = _writting_anki_notes(mapping)
    existing_versos = {
        (note.get("verso") or "").strip()
        for note in notes
        if (note.get("verso") or "").strip() != ""
    }
    anki_verso_keys = _significant_anki_versos(existing_versos)
    pull_cards, pull_missing, pull_warning_rectos = _writting_pull_from_notes(notes)

    cards: list[dict[str, str]] = []
    unsyncable: list[str] = []
    already_in_anki: list[str] = []
    seen_rectos: set[str] = set()

    for character in _pending_writting_characters():
        card = writting_card_from_character(character)
        if card is None:
            unsyncable.append(character.char)
            continue
        if card["verso"] in anki_verso_keys:
            already_in_anki.extend(_character_ids_from_verso(card["verso"]))
            continue
        if card["recto"] in seen_rectos:
            continue
        seen_rectos.add(card["recto"])
        cards.append(card)

    if already_in_anki:
        _mark_characters_synchronized(already_in_anki)

    mapping = {
        **mapping,
        "status": status_from_sync_counts(
            configured=True,
            push_count=len(cards),
            pull_count=len(pull_cards) + len(pull_missing),
            unsyncable_count=len(unsyncable),
        ),
    }
    return {
        "kind": "mandarin_writting",
        "count": len(cards),
        "cards": cards,
        "unsyncable": unsyncable,
        "pull_count": len(pull_cards) + len(pull_missing),
        "pull_cards": pull_cards,
        "pull_missing": pull_missing,
        "pull_warning_rectos": pull_warning_rectos,
        "pull_characters_to_create_count": 0,
        "deck": mapping,
    }


def get_pending_sync(kind: DeckKind) -> dict[str, Any]:
    mapping = get_deck_mapping(kind, check_pull=False)
    if mapping["status"] == "not_configured":
        raise ValueError(f'Deck kind "{kind}" is not configured.')

    if kind == "mandarin_vocabulary":
        return _get_pending_vocabulary_sync(mapping)
    if kind == "mandarin_writting":
        return _get_pending_writting_sync(mapping)
    raise ValueError(f'Unsupported deck kind "{kind}"')


def _mark_words_synchronized(word_ids: list[str]) -> int:
    if not word_ids:
        return 0
    updated = 0
    for word_id in word_ids:
        word = Word.query.filter_by(word=word_id).first()
        if word is None or word.synchronized:
            continue
        word.synchronized = True
        updated += 1
    db.session.commit()
    return updated


def _mark_characters_synchronized(char_ids: list[str]) -> int:
    if not char_ids:
        return 0
    updated = 0
    for char_id in char_ids:
        character = Character.query.filter_by(char=char_id).first()
        if character is None or character.synchronized:
            continue
        character.synchronized = True
        updated += 1
    db.session.commit()
    return updated


def _mark_synchronized(kind: DeckKind, ids: list[str]) -> int:
    if kind == "mandarin_vocabulary":
        return _mark_words_synchronized(ids)
    return _mark_characters_synchronized(ids)


def _sync_mark_ids_for_cards(
    kind: DeckKind,
    cards: list[dict[str, str]],
) -> list[str]:
    """IDs to mark synchronized after syncing/ignoring these cards."""
    if kind == "mandarin_vocabulary":
        return [card["id"] for card in cards]
    return _character_ids_from_writting_cards(cards)


def _build_anki_notes(
    *,
    kind: DeckKind,
    deck_name: str,
    model_name: str,
    field_map: dict[str, str],
    cards: list[dict[str, str]],
) -> list[dict[str, Any]]:
    notes: list[dict[str, Any]] = []
    for card in cards:
        if kind == "mandarin_vocabulary":
            anki_fields = {
                field_map["writting"]: card["writting"],
                field_map["pinyin"]: card["pinyin"],
                field_map["definition"]: card["definition"],
            }
        else:
            anki_fields = {
                field_map["recto"]: card["recto"],
                field_map["verso"]: card["verso"],
            }
        notes.append(
            {
                "deckName": deck_name,
                "modelName": model_name,
                "fields": anki_fields,
                "options": {"allowDuplicate": True},
                "tags": ["learn-mandarin"],
            }
        )
    return notes


def run_sync(
    kind: DeckKind,
    action: SyncAction,
    *,
    selected_ids: list[str] | None = None,
    sync_to_ankiweb: bool = True,
) -> dict[str, Any]:
    pending = get_pending_sync(kind)
    cards: list[dict[str, str]] = pending["cards"]
    unsyncable: list[str] = pending.get("unsyncable") or []
    mapping = pending["deck"]

    if action == "synchronize_all":
        to_add = cards
        to_ignore_cards: list[dict[str, str]] = []
        extra_ignore_ids: list[str] = []
    elif action == "cancel_all":
        to_add = []
        to_ignore_cards = cards
        # Writing: also ignore characters that cannot form a syncable card.
        extra_ignore_ids = unsyncable
    elif action == "partial":
        if selected_ids is None:
            raise ValueError("selected_ids is required for partial synchronization")
        if not isinstance(selected_ids, list) or not all(
            isinstance(item, str) for item in selected_ids
        ):
            raise ValueError("selected_ids must be an array of strings")
        pending_ids = {card["id"] for card in cards}
        unknown = [item for item in selected_ids if item not in pending_ids]
        if unknown:
            raise ValueError(
                f"Unknown pending card ids: {', '.join(sorted(unknown))}"
            )
        selected_set = set(selected_ids)
        to_add = [card for card in cards if card["id"] in selected_set]
        to_ignore_cards = [card for card in cards if card["id"] not in selected_set]
        extra_ignore_ids = []
    else:
        raise ValueError(f'Unsupported sync action "{action}"')

    to_ignore_ids = _sync_mark_ids_for_cards(kind, to_ignore_cards) + extra_ignore_ids

    added = 0
    if to_add:
        notes = _build_anki_notes(
            kind=kind,
            deck_name=mapping["deck_name"],
            model_name=mapping["model_name"],
            field_map=mapping["fields"],
            cards=to_add,
        )
        results = anki_connect.add_notes(notes)
        succeeded_cards: list[dict[str, str]] = []
        failed = 0
        for card, note_id in zip(to_add, results):
            if note_id is None:
                failed += 1
                continue
            succeeded_cards.append(card)
        if succeeded_cards:
            added = _mark_synchronized(
                kind,
                _sync_mark_ids_for_cards(kind, succeeded_cards),
            )
        if failed > 0 and added == 0:
            raise anki_connect.AnkiConnectError(
                f"Failed to add {failed} note(s) to Anki."
            )
        if failed > 0:
            ignored = _mark_synchronized(kind, to_ignore_ids)
            result = _finalize_deck_sync_result(
                {
                    "kind": kind,
                    "action": action,
                    "direction": "push",
                    "added": added,
                    "ignored": ignored,
                    "failed": failed,
                    "deck": get_deck_mapping(kind),
                }
            )
            _maybe_sync_ankiweb_after_push(
                notes_added=added,
                enabled=sync_to_ankiweb,
            )
            return result

    ignored = _mark_synchronized(kind, to_ignore_ids)
    result = _finalize_deck_sync_result(
        {
            "kind": kind,
            "action": action,
            "direction": "push",
            "added": added,
            "ignored": ignored,
            "failed": 0,
            "deck": get_deck_mapping(kind),
        }
    )
    _maybe_sync_ankiweb_after_push(notes_added=added, enabled=sync_to_ankiweb)
    return result


def run_pull(
    kind: DeckKind,
    action: SyncAction,
    *,
    selected_ids: list[str] | None = None,
) -> dict[str, Any]:
    pending = get_pending_sync(kind)
    cards: list[dict[str, Any]] = list(pending.get("pull_cards") or [])

    if action == "synchronize_all":
        to_import = cards
        to_ignore: list[dict[str, Any]] = []
    elif action == "cancel_all":
        to_import = []
        to_ignore = cards
    elif action == "partial":
        if selected_ids is None:
            raise ValueError("selected_ids is required for partial pull")
        if not isinstance(selected_ids, list) or not all(
            isinstance(item, str) for item in selected_ids
        ):
            raise ValueError("selected_ids must be an array of strings")
        pending_ids = {str(card["id"]) for card in cards}
        unknown = [item for item in selected_ids if item not in pending_ids]
        if unknown:
            raise ValueError(
                f"Unknown pending pull card ids: {', '.join(sorted(unknown))}"
            )
        selected_set = set(selected_ids)
        to_import = [card for card in cards if str(card["id"]) in selected_set]
        to_ignore = [card for card in cards if str(card["id"]) not in selected_set]
    else:
        raise ValueError(f'Unsupported sync action "{action}"')

    imported = 0
    characters_added = 0
    failed = 0
    if kind == "mandarin_vocabulary":
        guesses: dict[str, str] = {}
        if to_import:
            try:
                notes = _vocabulary_anki_notes(
                    pending.get("deck") or get_deck_mapping(kind, check_pull=False)
                )
                guesses = _build_pinyin_guess_map(notes)
            except Exception:
                guesses = {}
        for card in to_import:
            word_created, chars_created = _import_vocabulary_card(card, guesses)
            if word_created:
                imported += 1
                characters_added += chars_created
            else:
                failed += 1
        ignore_keys = [str(card["id"]) for card in to_ignore]
        if action == "cancel_all":
            ignore_keys.extend(
                str(item)
                for item in (pending.get("pull_missing") or [])
                if str(item).strip() != ""
            )
        ignored = _add_vocabulary_pull_ignored(ignore_keys)
    elif kind == "mandarin_writting":
        for card in to_import:
            if _import_writting_pull_card(card):
                imported += 1
            else:
                failed += 1
        ignore_keys: list[str] = []
        for card in to_ignore:
            anki_recto = str(card.get("anki_recto") or "").strip()
            if anki_recto != "":
                ignore_keys.append(anki_recto)
            else:
                ignore_keys.append(str(card["id"]))
        if action == "cancel_all":
            ignore_keys.extend(
                str(item)
                for item in (pending.get("pull_warning_rectos") or [])
                if str(item).strip() != ""
            )
        ignored = _add_writting_pull_ignored(ignore_keys)
    else:
        raise ValueError(f'Unsupported deck kind "{kind}"')

    if failed > 0 and imported == 0 and to_import:
        raise ValueError(f"Failed to import {failed} card(s) from Anki.")

    return _finalize_deck_sync_result(
        {
            "kind": kind,
            "action": action,
            "direction": "pull",
            "added": imported,
            "characters_added": characters_added,
            "ignored": ignored,
            "failed": failed,
            "deck": get_deck_mapping(kind),
        }
    )


def _finalize_deck_sync_result(result: dict[str, Any]) -> dict[str, Any]:
    kind = result["kind"]
    deck_status = result["deck"]["status"]
    maybe_promote_overall_anki_synchronization(
        vocabulary_status=deck_status if kind == "mandarin_vocabulary" else None,
        writting_status=deck_status if kind == "mandarin_writting" else None,
    )
    return result


def _maybe_sync_ankiweb_after_push(*, notes_added: int, enabled: bool = True) -> None:
    """Ask Anki Desktop to sync its collection to AnkiWeb after a push."""
    if not enabled or notes_added <= 0:
        return
    anki_connect.sync_with_ankiweb()


def run_quick_sync() -> dict[str, Any]:
    """Push all pending cards for both Anki decks (vocabulary then writting)."""
    vocabulary = run_sync(
        "mandarin_vocabulary",
        "synchronize_all",
        sync_to_ankiweb=False,
    )
    writting = run_sync(
        "mandarin_writting",
        "synchronize_all",
        sync_to_ankiweb=False,
    )
    _maybe_sync_ankiweb_after_push(
        notes_added=int(vocabulary.get("added") or 0)
        + int(writting.get("added") or 0),
    )
    return {
        "mandarin_vocabulary": vocabulary,
        "mandarin_writting": writting,
        "synchronization_status": get_overall_anki_synchronization_status(),
        "pending_push_estimate": pending_anki_push_estimate(),
    }


def get_deck_mapping(
    kind: DeckKind,
    *,
    check_pull: bool = True,
) -> dict[str, Any]:
    deck_name = get_setting(DECK_SETTING_KEYS[kind], "")
    model_name = get_setting(MODEL_SETTING_KEYS[kind], "")
    fields = _parse_fields(get_setting(FIELDS_SETTING_KEYS[kind], ""))
    mapping = {
        "deck_name": deck_name,
        "model_name": model_name,
        "fields": fields,
    }
    pull_count: int | None = None
    configured = (
        deck_name.strip() != ""
        and model_name.strip() != ""
        and _fields_complete(kind, fields)
    )
    if check_pull and configured:
        try:
            pull_count = _pending_pull_count_for_kind(kind, mapping)
        except Exception:
            # Anki unreachable mid-check: fall back to push-only status.
            pull_count = None
    return {
        "status": deck_status_for_mapping(
            deck_name,
            model_name,
            fields,
            kind,
            pull_count=pull_count,
        ),
        "deck_name": deck_name,
        "model_name": model_name,
        "fields": fields,
    }


def get_anki_status() -> dict:
    connected = anki_connect.is_connected()
    vocabulary = get_deck_mapping(
        "mandarin_vocabulary",
        check_pull=connected,
    )
    writting = get_deck_mapping(
        "mandarin_writting",
        check_pull=connected,
    )
    synchronization_status = maybe_promote_overall_anki_synchronization(
        vocabulary_status=vocabulary["status"],
        writting_status=writting["status"],
        check_pull=False,
    )
    return {
        "connected": connected,
        "synchronization_status": synchronization_status,
        "pending_push_estimate": pending_anki_push_estimate(),
        "decks": {
            "mandarin_vocabulary": vocabulary,
            "mandarin_writting": writting,
        },
    }


def validate_fields(kind: DeckKind, fields: dict[str, str]) -> dict[str, str]:
    if not isinstance(fields, dict):
        raise ValueError("fields must be an object")

    cleaned: dict[str, str] = {}
    for key in REQUIRED_FIELDS[kind]:
        value = fields.get(key)
        if not isinstance(value, str) or value.strip() == "":
            raise ValueError(f'fields.{key} is required for kind "{kind}"')
        cleaned[key] = value.strip()

    unexpected = set(fields) - set(REQUIRED_FIELDS[kind])
    if unexpected:
        raise ValueError(
            f"Unexpected field keys for kind \"{kind}\": {', '.join(sorted(unexpected))}"
        )

    return cleaned


def setup_deck(
    kind: DeckKind,
    deck_name: str,
    *,
    model_name: str,
    fields: dict[str, str],
    create: bool = False,
) -> dict[str, Any]:
    trimmed_deck = deck_name.strip()
    trimmed_model = model_name.strip()
    if trimmed_deck == "":
        raise ValueError("deck_name must be a non-empty string")
    if trimmed_model == "":
        raise ValueError("model_name must be a non-empty string")

    cleaned_fields = validate_fields(kind, fields)

    if create:
        anki_connect.create_deck(trimmed_deck)
    else:
        existing = anki_connect.deck_names()
        if trimmed_deck not in existing:
            raise ValueError(f'Deck "{trimmed_deck}" was not found in Anki.')

    models = anki_connect.model_names()
    if trimmed_model not in models:
        raise ValueError(f'Note type "{trimmed_model}" was not found in Anki.')

    model_fields = anki_connect.model_field_names(trimmed_model)
    for logical_key, anki_field in cleaned_fields.items():
        if anki_field not in model_fields:
            raise ValueError(
                f'Field "{anki_field}" (mapped to {logical_key}) '
                f'was not found on note type "{trimmed_model}".'
            )

    set_setting(DECK_SETTING_KEYS[kind], trimmed_deck, commit=False)
    set_setting(MODEL_SETTING_KEYS[kind], trimmed_model, commit=False)
    set_setting(
        FIELDS_SETTING_KEYS[kind],
        json.dumps(cleaned_fields, ensure_ascii=False),
        commit=True,
    )
    return get_deck_mapping(kind)
