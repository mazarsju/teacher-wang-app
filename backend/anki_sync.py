"""Anki deck mapping status and setup helpers."""

from __future__ import annotations

import json
from typing import Any, Literal

from backend import anki_connect
from backend.chinese_validation import is_han_character, is_han_text
from backend.extensions import db
from backend.models import Character, Word, utcnow
from backend.pinyin import normalize_anki_pinyin_token
from backend.settings import (
    SETTING_ANKI_MANDARIN_VOCABULARY_DECK,
    SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS,
    SETTING_ANKI_MANDARIN_VOCABULARY_MODEL,
    SETTING_ANKI_MANDARIN_VOCABULARY_PULL_IGNORED,
    SETTING_ANKI_MANDARIN_WRITTING_DECK,
    SETTING_ANKI_MANDARIN_WRITTING_FIELDS,
    SETTING_ANKI_MANDARIN_WRITTING_MODEL,
    get_setting,
    set_setting,
)

DeckKind = Literal["mandarin_vocabulary", "mandarin_writting"]
DeckStatus = Literal["not_configured", "synchronized", "not_synchronized"]
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


def _character_ids_from_verso(verso: str) -> list[str]:
    return list(verso)


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
        return len(_vocabulary_pull_cards_from_notes(notes))

    if kind == "mandarin_writting":
        verso_field = mapping["fields"].get("verso", "").strip()
        if verso_field == "":
            return 0
        existing_versos = anki_connect.field_values_in_deck(
            mapping["deck_name"],
            verso_field,
        )
        return _pull_count_from_anki_keys(existing_versos)

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


def _pull_count_from_anki_keys(anki_keys: set[str]) -> int:
    """Count Anki note keys that are not yet local Word.word values."""
    if not anki_keys:
        return 0
    local_words = {row.word for row in Word.query.with_entities(Word.word).all()}
    return sum(1 for key in anki_keys if key not in local_words)


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


def _get_vocabulary_pull_ignored() -> set[str]:
    return set(
        _parse_string_list_setting(
            get_setting(SETTING_ANKI_MANDARIN_VOCABULARY_PULL_IGNORED, "[]")
        )
    )


def _add_vocabulary_pull_ignored(writtings: list[str]) -> int:
    if not writtings:
        return 0
    ignored = _get_vocabulary_pull_ignored()
    before = len(ignored)
    ignored.update(item for item in writtings if item.strip() != "")
    set_setting(
        SETTING_ANKI_MANDARIN_VOCABULARY_PULL_IGNORED,
        json.dumps(sorted(ignored), ensure_ascii=False),
        commit=True,
    )
    return len(ignored) - before


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


def _characters_to_create_for_card(word_text: str, pinyin_field: str) -> list[str] | None:
    """Return chars that would be created, or None if the card cannot fully resolve."""
    to_create: list[str] = []
    for char, pinyin in _pair_writting_with_pinyin_tokens(word_text, pinyin_field):
        if Character.query.filter_by(char=char).first() is not None:
            continue
        if pinyin is None or len(pinyin) > 6:
            return None
        to_create.append(char)
    return to_create


def _ensure_characters_from_pinyin(word_text: str, pinyin_field: str) -> list[str]:
    """Create missing characters from Anki pinyin. Returns created char ids."""
    created: list[str] = []
    now = utcnow()
    for char, pinyin in _pair_writting_with_pinyin_tokens(word_text, pinyin_field):
        if Character.query.filter_by(char=char).first() is not None:
            continue
        if pinyin is None or len(pinyin) > 6:
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


def _import_vocabulary_card(card: dict[str, Any]) -> tuple[bool, int]:
    """Import one vocabulary card. Returns (word_created, characters_created)."""
    word_text = str(card.get("writting") or "").strip()
    if word_text == "" or not is_han_text(word_text) or len(word_text) > 10:
        return False, 0
    if Word.query.filter_by(word=word_text).first() is not None:
        return False, 0

    definition = str(card.get("definition") or "").strip()[:100]
    pinyin_field = str(card.get("pinyin") or "")
    created_chars = _ensure_characters_from_pinyin(word_text, pinyin_field)

    missing = [
        char
        for char in word_text
        if is_han_character(char)
        and Character.query.filter_by(char=char).first() is None
    ]
    if missing:
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
) -> list[dict[str, Any]]:
    local_words = {row.word for row in Word.query.with_entities(Word.word).all()}
    ignored = _get_vocabulary_pull_ignored()
    cards: list[dict[str, Any]] = []
    seen: set[str] = set()
    for note in notes:
        writting = (note.get("writting") or "").strip()
        if (
            writting == ""
            or writting in local_words
            or writting in ignored
            or writting in seen
            or not is_han_text(writting)
            or len(writting) > 10
        ):
            continue
        pinyin = (note.get("pinyin") or "").strip()
        characters_to_create = _characters_to_create_for_card(writting, pinyin)
        if characters_to_create is None:
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
    cards.sort(key=lambda card: str(card["writting"]))
    return cards


def _get_pending_vocabulary_sync(mapping: dict[str, Any]) -> dict[str, Any]:
    writting_field = mapping["fields"].get("writting", "").strip()
    pinyin_field = mapping["fields"].get("pinyin", "").strip()
    definition_field = mapping["fields"].get("definition", "").strip()
    if writting_field == "" or pinyin_field == "" or definition_field == "":
        raise ValueError("Mapped Anki vocabulary fields are incomplete.")

    notes = anki_connect.mapped_notes_in_deck(
        mapping["deck_name"],
        {
            "writting": writting_field,
            "pinyin": pinyin_field,
            "definition": definition_field,
        },
    )
    existing_writtings = {
        (note.get("writting") or "").strip()
        for note in notes
        if (note.get("writting") or "").strip() != ""
    }
    pull_cards = _vocabulary_pull_cards_from_notes(notes)
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
            pull_count=len(pull_cards),
        ),
    }
    return {
        "kind": "mandarin_vocabulary",
        "count": len(cards),
        "cards": cards,
        "unsyncable": [],
        "pull_count": len(pull_cards),
        "pull_cards": pull_cards,
        "pull_characters_to_create_count": len(pull_characters),
        "deck": mapping,
    }


def _get_pending_writting_sync(mapping: dict[str, Any]) -> dict[str, Any]:
    verso_field = mapping["fields"].get("verso", "").strip()
    if verso_field == "":
        raise ValueError('Mapped Anki field for "verso" is missing.')

    existing_versos = anki_connect.field_values_in_deck(
        mapping["deck_name"],
        verso_field,
    )
    pull_count = _pull_count_from_anki_keys(existing_versos)

    cards: list[dict[str, str]] = []
    unsyncable: list[str] = []
    already_in_anki: list[str] = []
    seen_rectos: set[str] = set()

    for character in _pending_writting_characters():
        card = writting_card_from_character(character)
        if card is None:
            unsyncable.append(character.char)
            continue
        if card["verso"] in existing_versos:
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
            pull_count=pull_count,
            unsyncable_count=len(unsyncable),
        ),
    }
    return {
        "kind": "mandarin_writting",
        "count": len(cards),
        "cards": cards,
        "unsyncable": unsyncable,
        "pull_count": pull_count,
        "pull_cards": [],
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
            return {
                "kind": kind,
                "action": action,
                "direction": "push",
                "added": added,
                "ignored": ignored,
                "failed": failed,
                "deck": get_deck_mapping(kind),
            }

    ignored = _mark_synchronized(kind, to_ignore_ids)
    return {
        "kind": kind,
        "action": action,
        "direction": "push",
        "added": added,
        "ignored": ignored,
        "failed": 0,
        "deck": get_deck_mapping(kind),
    }


def run_pull(
    kind: DeckKind,
    action: SyncAction,
    *,
    selected_ids: list[str] | None = None,
) -> dict[str, Any]:
    if kind != "mandarin_vocabulary":
        raise ValueError("Pull from Anki is only implemented for Mandarin vocabulary.")

    pending = get_pending_sync(kind)
    cards: list[dict[str, str]] = pending.get("pull_cards") or []

    if action == "synchronize_all":
        to_import = cards
        to_ignore = []
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
        pending_ids = {card["id"] for card in cards}
        unknown = [item for item in selected_ids if item not in pending_ids]
        if unknown:
            raise ValueError(
                f"Unknown pending pull card ids: {', '.join(sorted(unknown))}"
            )
        selected_set = set(selected_ids)
        to_import = [card for card in cards if card["id"] in selected_set]
        to_ignore = [card for card in cards if card["id"] not in selected_set]
    else:
        raise ValueError(f'Unsupported sync action "{action}"')

    imported = 0
    characters_added = 0
    failed = 0
    for card in to_import:
        word_created, chars_created = _import_vocabulary_card(card)
        if word_created:
            imported += 1
            characters_added += chars_created
        else:
            failed += 1

    ignored = _add_vocabulary_pull_ignored([str(card["id"]) for card in to_ignore])

    if failed > 0 and imported == 0 and to_import:
        raise ValueError(f"Failed to import {failed} card(s) from Anki.")

    return {
        "kind": kind,
        "action": action,
        "direction": "pull",
        "added": imported,
        "characters_added": characters_added,
        "ignored": ignored,
        "failed": failed,
        "deck": get_deck_mapping(kind),
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
    return {
        "connected": connected,
        "decks": {
            "mandarin_vocabulary": get_deck_mapping(
                "mandarin_vocabulary",
                check_pull=connected,
            ),
            "mandarin_writting": get_deck_mapping(
                "mandarin_writting",
                check_pull=connected,
            ),
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
