"""Anki deck mapping status and setup helpers."""

from __future__ import annotations

import json
from typing import Any, Literal

from backend import anki_connect
from backend.extensions import db
from backend.models import Character, Word
from backend.settings import (
    SETTING_ANKI_MANDARIN_VOCABULARY_DECK,
    SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS,
    SETTING_ANKI_MANDARIN_VOCABULARY_MODEL,
    SETTING_ANKI_MANDARIN_WRITTING_DECK,
    SETTING_ANKI_MANDARIN_WRITTING_FIELDS,
    SETTING_ANKI_MANDARIN_WRITTING_MODEL,
    get_setting,
    set_setting,
)

DeckKind = Literal["mandarin_vocabulary", "mandarin_writting"]
DeckStatus = Literal["not_configured", "synchronized", "not_synchronized"]
SyncAction = Literal["synchronize_all", "cancel_all", "partial"]

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


def _pending_count_for_kind(kind: DeckKind) -> int:
    if kind == "mandarin_vocabulary":
        return Word.query.filter_by(synchronized=False).count()
    # Mandarin writting sync is not implemented yet.
    return 0


def deck_status_for_mapping(
    deck_name: str,
    model_name: str,
    fields: dict[str, str],
    kind: DeckKind,
) -> DeckStatus:
    if (
        deck_name.strip() == ""
        or model_name.strip() == ""
        or not _fields_complete(kind, fields)
    ):
        return "not_configured"
    if kind == "mandarin_writting":
        # Content sync for writting is not implemented yet.
        return "not_synchronized"
    if _pending_count_for_kind(kind) > 0:
        return "not_synchronized"
    return "synchronized"


def get_pending_sync(kind: DeckKind) -> dict[str, Any]:
    mapping = get_deck_mapping(kind)
    if mapping["status"] == "not_configured":
        raise ValueError(f'Deck kind "{kind}" is not configured.')

    if kind == "mandarin_writting":
        raise ValueError("Mandarin writting synchronization is not implemented yet.")

    writting_field = mapping["fields"].get("writting", "").strip()
    if writting_field == "":
        raise ValueError('Mapped Anki field for "writting" is missing.')

    existing_writtings = anki_connect.field_values_in_deck(
        mapping["deck_name"],
        writting_field,
    )

    pending_words: list[Word] = []
    already_in_anki: list[str] = []
    for word in _pending_vocabulary_words():
        if word.word in existing_writtings:
            already_in_anki.append(word.word)
        else:
            pending_words.append(word)

    # Words already present in Anki should not stay pending forever.
    if already_in_anki:
        _mark_words_synchronized(already_in_anki)
        mapping = get_deck_mapping(kind)

    cards = [vocabulary_card_from_word(word) for word in pending_words]
    return {
        "kind": kind,
        "count": len(cards),
        "cards": cards,
        "deck": mapping,
    }


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


def _build_anki_notes(
    *,
    deck_name: str,
    model_name: str,
    field_map: dict[str, str],
    cards: list[dict[str, str]],
) -> list[dict[str, Any]]:
    notes: list[dict[str, Any]] = []
    for card in cards:
        anki_fields = {
            field_map["writting"]: card["writting"],
            field_map["pinyin"]: card["pinyin"],
            field_map["definition"]: card["definition"],
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
    mapping = pending["deck"]

    if action == "synchronize_all":
        to_add = cards
        to_ignore: list[dict[str, str]] = []
    elif action == "cancel_all":
        to_add = []
        to_ignore = cards
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
        to_ignore = [card for card in cards if card["id"] not in selected_set]
    else:
        raise ValueError(f'Unsupported sync action "{action}"')

    added = 0
    if to_add:
        notes = _build_anki_notes(
            deck_name=mapping["deck_name"],
            model_name=mapping["model_name"],
            field_map=mapping["fields"],
            cards=to_add,
        )
        results = anki_connect.add_notes(notes)
        succeeded_ids: list[str] = []
        failed = 0
        for card, note_id in zip(to_add, results):
            if note_id is None:
                failed += 1
                continue
            succeeded_ids.append(card["id"])
        if succeeded_ids:
            added = _mark_words_synchronized(succeeded_ids)
        if failed > 0 and added == 0:
            raise anki_connect.AnkiConnectError(
                f"Failed to add {failed} note(s) to Anki."
            )
        if failed > 0:
            ignored = _mark_words_synchronized([card["id"] for card in to_ignore])
            return {
                "kind": kind,
                "action": action,
                "added": added,
                "ignored": ignored,
                "failed": failed,
                "deck": get_deck_mapping(kind),
            }

    ignored = _mark_words_synchronized([card["id"] for card in to_ignore])
    return {
        "kind": kind,
        "action": action,
        "added": added,
        "ignored": ignored,
        "failed": 0,
        "deck": get_deck_mapping(kind),
    }


def get_deck_mapping(kind: DeckKind) -> dict[str, Any]:
    deck_name = get_setting(DECK_SETTING_KEYS[kind], "")
    model_name = get_setting(MODEL_SETTING_KEYS[kind], "")
    fields = _parse_fields(get_setting(FIELDS_SETTING_KEYS[kind], ""))
    return {
        "status": deck_status_for_mapping(deck_name, model_name, fields, kind),
        "deck_name": deck_name,
        "model_name": model_name,
        "fields": fields,
    }


def get_anki_status() -> dict:
    connected = anki_connect.is_connected()
    return {
        "connected": connected,
        "decks": {
            "mandarin_vocabulary": get_deck_mapping("mandarin_vocabulary"),
            "mandarin_writting": get_deck_mapping("mandarin_writting"),
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
