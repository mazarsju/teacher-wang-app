"""Per-user key/value settings (e.g. HSK level)."""

from __future__ import annotations

from backend.extensions import db
from backend.models import Setting

SETTING_LEVEL = "level"
SETTING_ANKI_SYNCHRONIZATION_STATUS = "anki_synchronization_status"
SETTING_ANKI_MANDARIN_VOCABULARY_DECK = "anki_mandarin_vocabulary_deck"
SETTING_ANKI_MANDARIN_VOCABULARY_MODEL = "anki_mandarin_vocabulary_model"
SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS = "anki_mandarin_vocabulary_fields"
SETTING_ANKI_MANDARIN_VOCABULARY_PULL_IGNORED = (
    "anki_mandarin_vocabulary_pull_ignored"
)
SETTING_ANKI_MANDARIN_WRITTING_DECK = "anki_mandarin_writting_deck"
SETTING_ANKI_MANDARIN_WRITTING_MODEL = "anki_mandarin_writting_model"
SETTING_ANKI_MANDARIN_WRITTING_FIELDS = "anki_mandarin_writting_fields"
SETTING_ANKI_MANDARIN_WRITTING_PULL_IGNORED = (
    "anki_mandarin_writting_pull_ignored"
)

LEGACY_SETTING_MIGRATIONS: tuple[tuple[str, str], ...] = (
    ("anki_character_deck", SETTING_ANKI_MANDARIN_WRITTING_DECK),
    ("anki_characters_deck", SETTING_ANKI_MANDARIN_WRITTING_DECK),
    ("anki_characters_model", SETTING_ANKI_MANDARIN_WRITTING_MODEL),
    ("anki_characters_fields", SETTING_ANKI_MANDARIN_WRITTING_FIELDS),
    ("anki_words_deck", SETTING_ANKI_MANDARIN_VOCABULARY_DECK),
    ("anki_words_model", SETTING_ANKI_MANDARIN_VOCABULARY_MODEL),
    ("anki_words_fields", SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS),
)

DEFAULT_SETTINGS: dict[str, str] = {
    SETTING_LEVEL: "",
    SETTING_ANKI_SYNCHRONIZATION_STATUS: "not_synchronized",
    SETTING_ANKI_MANDARIN_VOCABULARY_DECK: "",
    SETTING_ANKI_MANDARIN_VOCABULARY_MODEL: "",
    SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS: "",
    SETTING_ANKI_MANDARIN_VOCABULARY_PULL_IGNORED: "[]",
    SETTING_ANKI_MANDARIN_WRITTING_DECK: "",
    SETTING_ANKI_MANDARIN_WRITTING_MODEL: "",
    SETTING_ANKI_MANDARIN_WRITTING_FIELDS: "",
    SETTING_ANKI_MANDARIN_WRITTING_PULL_IGNORED: "[]",
}

def get_setting(user_id: str, key: str, default: str = "") -> str:
    row = db.session.get(Setting, (user_id, key))
    if row is None:
        return default
    return row.value


def set_setting(user_id: str, key: str, value: str, *, commit: bool = False) -> None:
    row = db.session.get(Setting, (user_id, key))
    if row is None:
        row = Setting(user_id=user_id, key=key, value=value)
        db.session.add(row)
    else:
        row.value = value

    if commit:
        db.session.commit()
    else:
        db.session.flush()


def ensure_default_settings(user_id: str, *, commit: bool = True) -> None:
    for legacy_key, new_key in LEGACY_SETTING_MIGRATIONS:
        legacy = db.session.get(Setting, (user_id, legacy_key))
        if legacy is not None and db.session.get(Setting, (user_id, new_key)) is None:
            db.session.add(
                Setting(user_id=user_id, key=new_key, value=legacy.value)
            )
            db.session.delete(legacy)
        elif legacy is not None:
            db.session.delete(legacy)

    for key, default_value in DEFAULT_SETTINGS.items():
        if db.session.get(Setting, (user_id, key)) is None:
            db.session.add(Setting(user_id=user_id, key=key, value=default_value))
    if commit:
        db.session.commit()
    else:
        db.session.flush()


def get_level(user_id: str) -> int | None:
    raw = get_setting(user_id, SETTING_LEVEL, "")
    if raw.strip() == "":
        return None
    return int(raw)


def set_level(user_id: str, level: int | None, *, commit: bool = True) -> None:
    ensure_default_settings(user_id, commit=False)
    set_setting(
        user_id,
        SETTING_LEVEL,
        "" if level is None else str(level),
        commit=commit,
    )


def delete_setting(user_id: str, key: str, *, commit: bool = False) -> None:
    row = db.session.get(Setting, (user_id, key))
    if row is not None:
        db.session.delete(row)
    if commit:
        db.session.commit()
    else:
        db.session.flush()
