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
from backend.models import (
    Character,
    HskCharacter,
    IgnoreVocabCard,
    IgnoreWritingCard,
    Word,
    utcnow,
)
from backend.settings import (
    SETTING_ANKI_MANDARIN_VOCABULARY_DECK,
    SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS,
    SETTING_ANKI_MANDARIN_VOCABULARY_MODEL,
    SETTING_ANKI_MANDARIN_WRITING_DECK,
    SETTING_ANKI_MANDARIN_WRITING_FIELDS,
    SETTING_ANKI_MANDARIN_WRITING_MODEL,
    SETTING_ANKI_SYNCHRONIZATION_STATUS,
    get_setting,
    set_setting,
)

DeckKind = Literal["mandarin_vocabulary", "mandarin_writing"]
DeckStatus = Literal["not_configured", "synchronized", "not_synchronized"]
OverallAnkiSynchronizationStatus = Literal["not_synchronized", "synchronized"]
SyncAction = Literal["synchronize_all", "cancel_all", "partial"]

DECK_SETTING_KEYS: dict[DeckKind, str] = {
    "mandarin_vocabulary": SETTING_ANKI_MANDARIN_VOCABULARY_DECK,
    "mandarin_writing": SETTING_ANKI_MANDARIN_WRITING_DECK,
}

MODEL_SETTING_KEYS: dict[DeckKind, str] = {
    "mandarin_vocabulary": SETTING_ANKI_MANDARIN_VOCABULARY_MODEL,
    "mandarin_writing": SETTING_ANKI_MANDARIN_WRITING_MODEL,
}

FIELDS_SETTING_KEYS: dict[DeckKind, str] = {
    "mandarin_vocabulary": SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS,
    "mandarin_writing": SETTING_ANKI_MANDARIN_WRITING_FIELDS,
}

REQUIRED_FIELDS: dict[DeckKind, tuple[str, ...]] = {
    "mandarin_writing": ("recto", "verso"),
    "mandarin_vocabulary": ("writing", "pinyin", "definition"),
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
        Word.query.filter_by(user_id=user_id, anki_voc_sync=False)
        .order_by(Word.word)
        .all()
    )


def _pending_writing_words(user_id: str) -> list[Word]:
    return (
        Word.query.filter_by(user_id=user_id, writing_known=True, anki_writing_sync=False)
        .order_by(Word.word)
        .all()
    )


def _find_character(user_id: str, char: str) -> Character | None:
    return Character.query.filter_by(user_id=user_id, char=char).first()


def _mark_characters_writing_known(user_id: str, chars: list[str]) -> int:
    """Force ``writing_known`` for characters pulled from Anki verso words
    that don't exist as a local ``Word`` (so ``rebuild_characters_from_words``
    can't derive it from the word table)."""
    updated = 0
    for char in chars:
        record = _find_character(user_id, char)
        if record is None or record.writing_known:
            continue
        record.writing_known = True
        record.updated_at = utcnow()
        updated += 1
    if updated:
        db.session.commit()
    return updated


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
        "writing": word.word,
        "pinyin": _vocabulary_card_pinyin(word.user_id, word.word),
        "definition": word.definition or "",
    }


def writing_card_from_word(word: Word) -> dict[str, str] | None:
    definition = (word.definition or "").strip()
    pinyin = (word.pinyin or "").strip()
    if definition == "" or pinyin == "":
        return None
    recto = f"{definition} ({pinyin})"
    return {"id": word.word, "recto": recto, "verso": word.word}


def _pending_count_for_kind(user_id: str, kind: DeckKind) -> int:
    if kind == "mandarin_vocabulary":
        return Word.query.filter_by(user_id=user_id, anki_voc_sync=False).count()
    if kind == "mandarin_writing":
        return Word.query.filter_by(
            user_id=user_id, writing_known=True, anki_writing_sync=False
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
    ) + _pending_count_for_kind(user_id, "mandarin_writing")


def maybe_promote_overall_anki_synchronization(
    user_id: str,
    *,
    vocabulary_status: DeckStatus | None = None,
    writing_status: DeckStatus | None = None,
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
    write_status = writing_status
    if write_status is None:
        write_status = get_deck_mapping(user_id, "mandarin_writing")["status"]

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
        row.writing
        for row in IgnoreVocabCard.query.filter_by(user_id=user_id)
        .with_entities(IgnoreVocabCard.writing)
        .all()
    }


def _add_vocabulary_pull_ignored(user_id: str, writings: list[str]) -> int:
    added = 0
    for writing in writings:
        key = writing.strip()
        if key == "":
            continue
        if (
            IgnoreVocabCard.query.filter_by(user_id=user_id, writing=key).first()
            is not None
        ):
            continue
        db.session.add(IgnoreVocabCard(user_id=user_id, writing=key))
        added += 1
    if added:
        db.session.commit()
    return added


# ``recto`` stores the ignored word text (verso), not a recto value -- kept
# for the existing column name/migration rather than renaming for a rename's
# sake.
def _get_writing_pull_ignored(user_id: str) -> set[str]:
    return {
        row.recto
        for row in IgnoreWritingCard.query.filter_by(user_id=user_id)
        .with_entities(IgnoreWritingCard.recto)
        .all()
    }


def _add_writing_pull_ignored(user_id: str, rectos: list[str]) -> int:
    added = 0
    for recto in rectos:
        key = recto.strip()
        if key == "":
            continue
        if (
            IgnoreWritingCard.query.filter_by(user_id=user_id, recto=key).first()
            is not None
        ):
            continue
        db.session.add(IgnoreWritingCard(user_id=user_id, recto=key))
        added += 1
    if added:
        db.session.commit()
    return added


def _import_vocabulary_card(
    user_id: str,
    card: dict[str, Any],
    guesses: dict[str, str] | None = None,
) -> bool:
    word_text = str(card.get("writing") or "").strip()
    han_chars = [char for char in word_text if is_han_character(char)]
    if word_text == "" or not han_chars or len(word_text) > 10:
        return False
    if _find_word(user_id, word_text) is not None:
        return False

    definition = str(card.get("definition") or "").strip()[:100]
    pinyin_field = str(card.get("pinyin") or "")

    # Guessing falls back to the HSK master reading first (``guesses`` from
    # ``hsk_characters.most_used_pinyin``), then to the reading the user
    # already has for that character -- both count as "possible to re-create".
    resolved_guesses = dict(guesses or {})
    for char in han_chars:
        if char in resolved_guesses:
            continue
        known = _find_character(user_id, char)
        if known is not None and known.pinyin:
            resolved_guesses[char] = known.pinyin

    stored_pinyin = build_word_pinyin_for_storage(
        word_text, pinyin_field, resolved_guesses
    )
    if stored_pinyin is None:
        return False

    now = utcnow()
    word_record = Word(
        user_id=user_id,
        word=word_text,
        definition=definition or None,
        pinyin=stored_pinyin or None,
        anki_voc_sync=True,
        updated_at=now,
    )
    db.session.add(word_record)
    db.session.flush()
    return True


def _import_writing_pull_card(user_id: str, card: dict[str, Any]) -> bool:
    verso = str(card.get("verso") or card.get("id") or "").strip()
    if verso == "":
        return False
    word = _find_word(user_id, verso)
    if word is None:
        return False
    word.writing_known = True
    word.anki_writing_sync = True
    word.updated_at = utcnow()
    db.session.commit()
    return True


def _mark_words_synchronized(user_id: str, word_ids: list[str]) -> int:
    if not word_ids:
        return 0
    updated = 0
    for word_id in word_ids:
        word = _find_word(user_id, word_id)
        if word is None or word.anki_voc_sync:
            continue
        word.anki_voc_sync = True
        updated += 1
    db.session.commit()
    return updated


def _mark_words_writing_synchronized(user_id: str, word_ids: list[str]) -> int:
    if not word_ids:
        return 0
    updated = 0
    for word_id in word_ids:
        word = _find_word(user_id, word_id)
        if word is None or word.anki_writing_sync:
            continue
        word.anki_writing_sync = True
        updated += 1
    db.session.commit()
    return updated


def mark_synchronized(user_id: str, kind: DeckKind, ids: list[str]) -> int:
    if kind == "mandarin_vocabulary":
        return _mark_words_synchronized(user_id, ids)
    return _mark_words_writing_synchronized(user_id, ids)


def _sync_mark_ids_for_cards(
    kind: DeckKind,
    cards: list[dict[str, Any]],
) -> list[str]:
    return [str(card["id"]) for card in cards]


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
    writing = get_deck_mapping(user_id, "mandarin_writing")
    synchronization_status = maybe_promote_overall_anki_synchronization(
        user_id,
        vocabulary_status=vocabulary["status"],
        writing_status=writing["status"],
    )
    return {
        "synchronization_status": synchronization_status,
        "pending_push_estimate": pending_anki_push_estimate(user_id),
        "decks": {
            "mandarin_vocabulary": vocabulary,
            "mandarin_writing": writing,
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


def _writing_known_words(user_id: str) -> list[str]:
    return [
        row.word
        for row in Word.query.filter_by(user_id=user_id, writing_known=True)
        .with_entities(Word.word)
        .all()
    ]


def _local_characters(user_id: str) -> list[dict[str, Any]]:
    return [
        {
            "char": row.char,
            "pinyin": row.pinyin,
            "writing_known": bool(row.writing_known),
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


def _writing_push_payload(user_id: str, mapping: dict[str, Any]) -> dict[str, Any]:
    cards: list[dict[str, str]] = []
    unsyncable: list[str] = []
    for word in _pending_writing_words(user_id):
        card = writing_card_from_word(word)
        if card is None:
            unsyncable.append(word.word)
            continue
        cards.append(card)

    return {
        "kind": "mandarin_writing",
        "push_cards": cards,
        "unsyncable": unsyncable,
        "local_words": _local_words(user_id),
        "writing_known_words": _writing_known_words(user_id),
        "ignore_keys": sorted(_get_writing_pull_ignored(user_id)),
        "deck": mapping,
    }


def get_sync_data(user_id: str, kind: DeckKind) -> dict[str, Any]:
    mapping = get_deck_mapping(user_id, kind)
    if mapping["status"] == "not_configured":
        raise ValueError(f'Deck kind "{kind}" is not configured.')

    if kind == "mandarin_vocabulary":
        return _vocabulary_push_payload(user_id, mapping)
    if kind == "mandarin_writing":
        return _writing_push_payload(user_id, mapping)
    raise ValueError(f'Unsupported deck kind "{kind}"')


def _finalize_deck_result(
    user_id: str,
    *,
    kind: DeckKind,
    action: SyncAction,
    direction: str,
    added: int,
    ignored: int,
    failed: int | list[str],
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
        writing_status=deck["status"] if kind == "mandarin_writing" else None,
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
        added = _mark_words_writing_synchronized(user_id, succeeded_card_ids)
        ignored = _mark_words_writing_synchronized(user_id, ignore_ids)

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


def _hsk_pinyin_guesses_for_cards(cards: list[dict[str, Any]]) -> dict[str, str]:
    chars: set[str] = set()
    for card in cards:
        word_text = str(card.get("writing") or "").strip()
        chars.update(char for char in word_text if is_han_character(char))
    if not chars:
        return {}
    rows = HskCharacter.query.filter(HskCharacter.character.in_(chars)).all()
    return {
        row.character: row.most_used_pinyin
        for row in rows
        if row.most_used_pinyin
    }


def apply_pull(
    user_id: str,
    kind: DeckKind,
    action: SyncAction,
    *,
    cards: list[dict[str, Any]],
    ignore_keys: list[str],
    pull_count_after: int | None = None,
    additional_char: list[str] | None = None,
) -> dict[str, Any]:
    imported = 0
    characters_added = 0
    failed_cards: list[str] = []

    if kind == "mandarin_vocabulary":
        guesses = _hsk_pinyin_guesses_for_cards(cards)
        chars_before = {
            row.char for row in Character.query.filter_by(user_id=user_id).all()
        }
        for card in cards:
            if _import_vocabulary_card(user_id, card, guesses):
                imported += 1
            else:
                failed_cards.append(str(card.get("writing") or "").strip())
        if imported:
            rebuild_characters_from_words(user_id)
            chars_after = {
                row.char for row in Character.query.filter_by(user_id=user_id).all()
            }
            characters_added = len(chars_after - chars_before)
        db.session.commit()
        ignored = _add_vocabulary_pull_ignored(user_id, ignore_keys)
    elif kind == "mandarin_writing":
        for card in cards:
            if _import_writing_pull_card(user_id, card):
                imported += 1
            else:
                failed_cards.append(
                    str(card.get("verso") or card.get("id") or "").strip()
                )
        if imported:
            rebuild_characters_from_words(user_id)
            db.session.commit()
        if additional_char:
            _mark_characters_writing_known(user_id, additional_char)
        ignored = _add_writing_pull_ignored(user_id, ignore_keys)
    else:
        raise ValueError(f'Unsupported deck kind "{kind}"')

    return _finalize_deck_result(
        user_id,
        kind=kind,
        action=action,
        direction="pull",
        added=imported,
        ignored=ignored,
        failed=failed_cards,
        characters_added=characters_added,
        pull_count=pull_count_after,
    )


def sync_mark_ids_for_cards(kind: DeckKind, cards: list[dict[str, Any]]) -> list[str]:
    return _sync_mark_ids_for_cards(kind, cards)
