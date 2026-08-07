"""Anki deck mapping status and Postgres-backed sync helpers (no AnkiConnect)."""

from __future__ import annotations

import json
from typing import Any, Literal

from backend.character_sync import (
    build_word_pinyin_for_storage,
    rebuild_characters_from_words,
)
from backend.chinese_validation import is_han_character
from backend.extensions import db
from backend.models import Character, IgnoreVocabCard, IgnoreWrittingCard, Word, utcnow
from backend.settings import (
    SETTING_ANKI_MANDARIN_VOCABULARY_DECK,
    SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS,
    SETTING_ANKI_MANDARIN_VOCABULARY_MODEL,
    SETTING_ANKI_MANDARIN_WRITTING_DECK,
    SETTING_ANKI_MANDARIN_WRITTING_FIELDS,
    SETTING_ANKI_MANDARIN_WRITTING_MODEL,
    SETTING_ANKI_SYNCHRONIZATION_STATUS,
    get_setting,
    set_setting,
)

DeckKind = Literal["mandarin_vocabulary", "mandarin_writting"]
DeckStatus = Literal["not_configured", "synchronized", "not_synchronized"]
OverallAnkiSynchronizationStatus = Literal["not_synchronized", "synchronized"]
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


def _pending_vocabulary_words(user_id: str) -> list[Word]:
    return (
        Word.query.filter_by(user_id=user_id, synchronized=False)
        .order_by(Word.word)
        .all()
    )


def _pending_writting_characters(user_id: str) -> list[Character]:
    return (
        Character.query.filter_by(
            user_id=user_id,
            writting_known=True,
            synchronized=False,
        )
        .order_by(Character.char)
        .all()
    )


def _find_character(user_id: str, char: str) -> Character | None:
    return Character.query.filter_by(user_id=user_id, char=char).first()


def _find_word(user_id: str, word: str) -> Word | None:
    return Word.query.filter_by(user_id=user_id, word=word).first()


def _vocabulary_card_pinyin(user_id: str, word_text: str) -> str:
    """Build pinyin for a word, keeping unrecognized characters as-is."""
    pieces: list[str] = []
    last_was_pinyin = False
    for char in word_text:
        character = _find_character(user_id, char)
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
        "pinyin": _vocabulary_card_pinyin(word.user_id, word.word),
        "definition": word.definition or "",
    }


def _is_word_eligible_for_writting(word: Word) -> bool:
    if word.definition is None or word.definition.strip() == "":
        return False
    for char in word.word:
        character = _find_character(word.user_id, char)
        if character is None or not character.writting_known:
            return False
    return True


def _find_writting_word_for_character(character: Character) -> Word | None:
    candidates = [
        word
        for word in Word.query.filter(
            Word.user_id == character.user_id,
            Word.word.contains(character.char),
        ).all()
        if _is_word_eligible_for_writting(word)
    ]
    if not candidates:
        return None
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
    pinyin = _vocabulary_card_pinyin(word.user_id, word.word)
    recto = f"{definition} ({pinyin})"
    return {
        "id": recto,
        "recto": recto,
        "verso": word.word,
    }


def _verso_significant_part(verso: str) -> str:
    return verso.split("-", 1)[0]


def _character_ids_from_verso(verso: str) -> list[str]:
    significant = _verso_significant_part(verso)
    return [char for char in significant if is_han_character(char)]


def _character_ids_from_writting_cards(cards: list[dict[str, Any]]) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for card in cards:
        for char_id in _character_ids_from_verso(str(card.get("verso") or "")):
            if char_id in seen:
                continue
            seen.add(char_id)
            ids.append(char_id)
    return ids


def _pending_count_for_kind(user_id: str, kind: DeckKind) -> int:
    if kind == "mandarin_vocabulary":
        return Word.query.filter_by(user_id=user_id, synchronized=False).count()
    if kind == "mandarin_writting":
        return Character.query.filter_by(
            user_id=user_id,
            writting_known=True,
            synchronized=False,
        ).count()
    return 0


def deck_status_for_mapping(
    user_id: str,
    deck_name: str,
    model_name: str,
    fields: dict[str, str],
    kind: DeckKind,
    *,
    pull_count: int | None = None,
    push_count: int | None = None,
    unsyncable_count: int = 0,
) -> DeckStatus:
    if (
        deck_name.strip() == ""
        or model_name.strip() == ""
        or not _fields_complete(kind, fields)
    ):
        return "not_configured"
    pending_push = (
        push_count
        if push_count is not None
        else _pending_count_for_kind(user_id, kind)
    )
    if pending_push > 0 or unsyncable_count > 0:
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
    if not configured:
        return "not_configured"
    if push_count > 0 or pull_count > 0 or unsyncable_count > 0:
        return "not_synchronized"
    return "synchronized"


def get_overall_anki_synchronization_status(
    user_id: str,
) -> OverallAnkiSynchronizationStatus:
    raw = get_setting(user_id, SETTING_ANKI_SYNCHRONIZATION_STATUS, "not_synchronized")
    if raw == "synchronized":
        return "synchronized"
    return "not_synchronized"


def pending_anki_push_estimate(user_id: str) -> int:
    return _pending_count_for_kind(
        user_id, "mandarin_vocabulary"
    ) + _pending_count_for_kind(user_id, "mandarin_writting")


def maybe_promote_overall_anki_synchronization(
    user_id: str,
    *,
    vocabulary_status: DeckStatus | None = None,
    writting_status: DeckStatus | None = None,
) -> OverallAnkiSynchronizationStatus:
    """Promote overall status to synchronized once both decks are synchronized.

    Sticky: after the first complete synchronization it stays synchronized.
    """
    current = get_overall_anki_synchronization_status(user_id)
    if current == "synchronized":
        return current

    vocab_status = vocabulary_status
    if vocab_status is None:
        vocab_status = get_deck_mapping(user_id, "mandarin_vocabulary")["status"]
    write_status = writting_status
    if write_status is None:
        write_status = get_deck_mapping(user_id, "mandarin_writting")["status"]

    if vocab_status == "synchronized" and write_status == "synchronized":
        set_setting(
            user_id,
            SETTING_ANKI_SYNCHRONIZATION_STATUS,
            "synchronized",
            commit=True,
        )
        return "synchronized"
    return current


def _get_vocabulary_pull_ignored(user_id: str) -> set[str]:
    return {
        row.writting
        for row in IgnoreVocabCard.query.filter_by(user_id=user_id)
        .with_entities(IgnoreVocabCard.writting)
        .all()
    }


def _add_vocabulary_pull_ignored(user_id: str, writtings: list[str]) -> int:
    added = 0
    for writting in writtings:
        key = writting.strip()
        if key == "":
            continue
        if (
            IgnoreVocabCard.query.filter_by(user_id=user_id, writting=key).first()
            is not None
        ):
            continue
        db.session.add(IgnoreVocabCard(user_id=user_id, writting=key))
        added += 1
    if added:
        db.session.commit()
    return added


def _get_writting_pull_ignored(user_id: str) -> set[str]:
    return {
        row.recto
        for row in IgnoreWrittingCard.query.filter_by(user_id=user_id)
        .with_entities(IgnoreWrittingCard.recto)
        .all()
    }


def _add_writting_pull_ignored(user_id: str, rectos: list[str]) -> int:
    added = 0
    for recto in rectos:
        key = recto.strip()
        if key == "":
            continue
        if (
            IgnoreWrittingCard.query.filter_by(user_id=user_id, recto=key).first()
            is not None
        ):
            continue
        db.session.add(IgnoreWrittingCard(user_id=user_id, recto=key))
        added += 1
    if added:
        db.session.commit()
    return added


def _import_vocabulary_card(
    user_id: str,
    card: dict[str, Any],
    guesses: dict[str, str] | None = None,
) -> bool:
    word_text = str(card.get("writting") or "").strip()
    han_chars = [char for char in word_text if is_han_character(char)]
    if word_text == "" or not han_chars or len(word_text) > 10:
        return False
    if _find_word(user_id, word_text) is not None:
        return False

    definition = str(card.get("definition") or "").strip()[:100]
    pinyin_field = str(card.get("pinyin") or "")
    stored_pinyin = build_word_pinyin_for_storage(word_text, pinyin_field, guesses)
    if pinyin_field.strip() and stored_pinyin is None:
        return False

    now = utcnow()
    word_record = Word(
        user_id=user_id,
        word=word_text,
        definition=definition or None,
        pinyin=stored_pinyin or None,
        synchronized=True,
        updated_at=now,
    )
    db.session.add(word_record)
    db.session.flush()
    return True


def _import_writting_pull_card(user_id: str, card: dict[str, Any]) -> bool:
    char = str(card.get("id") or card.get("verso") or "").strip()
    if char == "" or not is_han_character(char):
        return False
    record = _find_character(user_id, char)
    if record is None:
        return False
    now = utcnow()
    record.writting_known = True
    record.synchronized = True
    record.updated_at = now
    db.session.commit()
    return True


def _mark_words_synchronized(user_id: str, word_ids: list[str]) -> int:
    if not word_ids:
        return 0
    updated = 0
    for word_id in word_ids:
        word = _find_word(user_id, word_id)
        if word is None or word.synchronized:
            continue
        word.synchronized = True
        updated += 1
    db.session.commit()
    return updated


def _mark_characters_synchronized(user_id: str, char_ids: list[str]) -> int:
    if not char_ids:
        return 0
    updated = 0
    for char_id in char_ids:
        character = _find_character(user_id, char_id)
        if character is None or character.synchronized:
            continue
        character.synchronized = True
        updated += 1
    db.session.commit()
    return updated


def mark_synchronized(user_id: str, kind: DeckKind, ids: list[str]) -> int:
    if kind == "mandarin_vocabulary":
        return _mark_words_synchronized(user_id, ids)
    return _mark_characters_synchronized(user_id, ids)


def _sync_mark_ids_for_cards(
    kind: DeckKind,
    cards: list[dict[str, Any]],
) -> list[str]:
    if kind == "mandarin_vocabulary":
        return [str(card["id"]) for card in cards]
    return _character_ids_from_writting_cards(cards)


def get_deck_mapping(user_id: str, kind: DeckKind) -> dict[str, Any]:
    deck_name = get_setting(user_id, DECK_SETTING_KEYS[kind], "")
    model_name = get_setting(user_id, MODEL_SETTING_KEYS[kind], "")
    fields = _parse_fields(get_setting(user_id, FIELDS_SETTING_KEYS[kind], ""))
    return {
        "status": deck_status_for_mapping(
            user_id,
            deck_name,
            model_name,
            fields,
            kind,
        ),
        "deck_name": deck_name,
        "model_name": model_name,
        "fields": fields,
    }


def get_anki_status(user_id: str) -> dict[str, Any]:
    """DB-only status. Frontend sets ``connected`` via AnkiConnect."""
    vocabulary = get_deck_mapping(user_id, "mandarin_vocabulary")
    writting = get_deck_mapping(user_id, "mandarin_writting")
    synchronization_status = maybe_promote_overall_anki_synchronization(
        user_id,
        vocabulary_status=vocabulary["status"],
        writting_status=writting["status"],
    )
    return {
        "synchronization_status": synchronization_status,
        "pending_push_estimate": pending_anki_push_estimate(user_id),
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
    user_id: str,
    kind: DeckKind,
    deck_name: str,
    *,
    model_name: str,
    fields: dict[str, str],
) -> dict[str, Any]:
    """Persist deck mapping only (Anki validation happens on the frontend)."""
    trimmed_deck = deck_name.strip()
    trimmed_model = model_name.strip()
    if trimmed_deck == "":
        raise ValueError("deck_name must be a non-empty string")
    if trimmed_model == "":
        raise ValueError("model_name must be a non-empty string")

    cleaned_fields = validate_fields(kind, fields)

    set_setting(user_id, DECK_SETTING_KEYS[kind], trimmed_deck, commit=False)
    set_setting(user_id, MODEL_SETTING_KEYS[kind], trimmed_model, commit=False)
    set_setting(
        user_id,
        FIELDS_SETTING_KEYS[kind],
        json.dumps(cleaned_fields, ensure_ascii=False),
        commit=True,
    )
    return get_deck_mapping(user_id, kind)


def _local_words(user_id: str) -> list[str]:
    return [
        row.word
        for row in Word.query.filter_by(user_id=user_id)
        .with_entities(Word.word)
        .all()
    ]


def _local_characters(user_id: str) -> list[dict[str, Any]]:
    return [
        {
            "char": row.char,
            "pinyin": row.pinyin,
            "writting_known": bool(row.writting_known),
            "synchronized": bool(row.synchronized),
        }
        for row in Character.query.filter_by(user_id=user_id)
        .order_by(Character.char)
        .all()
    ]


def _vocabulary_push_payload(user_id: str, mapping: dict[str, Any]) -> dict[str, Any]:
    cards = [
        vocabulary_card_from_word(word)
        for word in _pending_vocabulary_words(user_id)
    ]
    return {
        "kind": "mandarin_vocabulary",
        "push_cards": cards,
        "unsyncable": [],
        "local_words": _local_words(user_id),
        "characters": _local_characters(user_id),
        "ignore_keys": sorted(_get_vocabulary_pull_ignored(user_id)),
        "deck": mapping,
    }


def _writting_push_payload(user_id: str, mapping: dict[str, Any]) -> dict[str, Any]:
    cards: list[dict[str, str]] = []
    unsyncable: list[str] = []
    seen_rectos: set[str] = set()
    for character in _pending_writting_characters(user_id):
        card = writting_card_from_character(character)
        if card is None:
            unsyncable.append(character.char)
            continue
        if card["recto"] in seen_rectos:
            continue
        seen_rectos.add(card["recto"])
        cards.append(card)

    return {
        "kind": "mandarin_writting",
        "push_cards": cards,
        "unsyncable": unsyncable,
        "local_words": _local_words(user_id),
        "characters": _local_characters(user_id),
        "ignore_keys": sorted(_get_writting_pull_ignored(user_id)),
        "deck": mapping,
    }


def get_sync_data(user_id: str, kind: DeckKind) -> dict[str, Any]:
    mapping = get_deck_mapping(user_id, kind)
    if mapping["status"] == "not_configured":
        raise ValueError(f'Deck kind "{kind}" is not configured.')

    if kind == "mandarin_vocabulary":
        return _vocabulary_push_payload(user_id, mapping)
    if kind == "mandarin_writting":
        return _writting_push_payload(user_id, mapping)
    raise ValueError(f'Unsupported deck kind "{kind}"')


def _finalize_deck_result(
    user_id: str,
    *,
    kind: DeckKind,
    action: SyncAction,
    direction: str,
    added: int,
    ignored: int,
    failed: int,
    characters_added: int = 0,
    pull_count: int | None = None,
) -> dict[str, Any]:
    deck = get_deck_mapping(user_id, kind)
    if pull_count is not None:
        deck = {
            **deck,
            "status": deck_status_for_mapping(
                user_id,
                deck["deck_name"],
                deck["model_name"],
                deck["fields"],
                kind,
                pull_count=pull_count,
            ),
        }
    maybe_promote_overall_anki_synchronization(
        user_id,
        vocabulary_status=deck["status"] if kind == "mandarin_vocabulary" else None,
        writting_status=deck["status"] if kind == "mandarin_writting" else None,
    )
    result: dict[str, Any] = {
        "kind": kind,
        "action": action,
        "direction": direction,
        "added": added,
        "ignored": ignored,
        "failed": failed,
        "deck": deck,
    }
    if direction == "pull":
        result["characters_added"] = characters_added
    return result


def mark_synchronized_result(
    user_id: str,
    kind: DeckKind,
    ids: list[str],
    *,
    action: SyncAction = "partial",
    pull_count: int | None = None,
) -> dict[str, Any]:
    ignored = mark_synchronized(user_id, kind, ids)
    return _finalize_deck_result(
        user_id,
        kind=kind,
        action=action,
        direction="push",
        added=0,
        ignored=ignored,
        failed=0,
        pull_count=pull_count,
    )


def apply_push_completion(
    user_id: str,
    kind: DeckKind,
    action: SyncAction,
    *,
    succeeded_card_ids: list[str],
    ignore_ids: list[str],
    failed: int = 0,
    pull_count: int | None = None,
) -> dict[str, Any]:
    """Mark cards synchronized after a frontend Anki push (or cancel)."""
    if kind == "mandarin_vocabulary":
        added = _mark_words_synchronized(user_id, succeeded_card_ids)
        ignored = _mark_words_synchronized(user_id, ignore_ids)
    else:
        # Writing cards: ids may be rectos for success list; ignore_ids are char ids.
        # succeeded_card_ids for writing are character ids derived by the frontend.
        added = _mark_characters_synchronized(user_id, succeeded_card_ids)
        ignored = _mark_characters_synchronized(user_id, ignore_ids)

    return _finalize_deck_result(
        user_id,
        kind=kind,
        action=action,
        direction="push",
        added=added,
        ignored=ignored,
        failed=failed,
        pull_count=pull_count,
    )


def apply_pull(
    user_id: str,
    kind: DeckKind,
    action: SyncAction,
    *,
    cards: list[dict[str, Any]],
    ignore_keys: list[str],
    pinyin_guesses: dict[str, str] | None = None,
    pull_count_after: int | None = None,
) -> dict[str, Any]:
    imported = 0
    characters_added = 0
    failed = 0
    guesses = pinyin_guesses or {}

    if kind == "mandarin_vocabulary":
        chars_before = {
            row.char for row in Character.query.filter_by(user_id=user_id).all()
        }
        for card in cards:
            if _import_vocabulary_card(
                user_id,
                card,
                guesses,
            ):
                imported += 1
            else:
                failed += 1
        if imported:
            rebuild_characters_from_words(user_id)
            chars_after = {
                row.char for row in Character.query.filter_by(user_id=user_id).all()
            }
            characters_added = len(chars_after - chars_before)
            for char in chars_after - chars_before:
                record = _find_character(user_id, char)
                if record is not None:
                    record.synchronized = True
        db.session.commit()
        ignored = _add_vocabulary_pull_ignored(user_id, ignore_keys)
    elif kind == "mandarin_writting":
        for card in cards:
            if _import_writting_pull_card(user_id, card):
                imported += 1
            else:
                failed += 1
        ignored = _add_writting_pull_ignored(user_id, ignore_keys)
    else:
        raise ValueError(f'Unsupported deck kind "{kind}"')

    if failed > 0 and imported == 0 and cards:
        raise ValueError(f"Failed to import {failed} card(s) from Anki.")

    return _finalize_deck_result(
        user_id,
        kind=kind,
        action=action,
        direction="pull",
        added=imported,
        ignored=ignored,
        failed=failed,
        characters_added=characters_added,
        pull_count=pull_count_after,
    )


def character_ids_from_writting_cards(cards: list[dict[str, Any]]) -> list[str]:
    return _character_ids_from_writting_cards(cards)


def sync_mark_ids_for_cards(kind: DeckKind, cards: list[dict[str, Any]]) -> list[str]:
    return _sync_mark_ids_for_cards(kind, cards)
