"""Key/value application settings (e.g. HSK level)."""

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

# Legacy token keys removed when migrating to the token_count table.
LEGACY_TOKEN_SETTING_KEYS = (
    "total_tk",
    "tk_today",
    "tk_7_days",
    "tk_events",
)


def get_setting(key: str, default: str = "") -> str:
    row = db.session.get(Setting, key)
    if row is None:
        return default
    return row.value


def set_setting(key: str, value: str, *, commit: bool = False) -> None:
    row = db.session.get(Setting, key)
    if row is None:
        row = Setting(key=key, value=value)
        db.session.add(row)
    else:
        row.value = value

    if commit:
        db.session.commit()
    else:
        db.session.flush()


def ensure_default_settings(*, commit: bool = True) -> None:
    for legacy_key, new_key in LEGACY_SETTING_MIGRATIONS:
        legacy = db.session.get(Setting, legacy_key)
        if legacy is not None and db.session.get(Setting, new_key) is None:
            db.session.add(Setting(key=new_key, value=legacy.value))
            db.session.delete(legacy)
        elif legacy is not None:
            db.session.delete(legacy)

    for key, default_value in DEFAULT_SETTINGS.items():
        if db.session.get(Setting, key) is None:
            db.session.add(Setting(key=key, value=default_value))
    if commit:
        db.session.commit()
    else:
        db.session.flush()


def get_level() -> int | None:
    raw = get_setting(SETTING_LEVEL, "")
    if raw.strip() == "":
        return None
    return int(raw)


def set_level(level: int | None, *, commit: bool = True) -> None:
    ensure_default_settings(commit=False)
    set_setting(SETTING_LEVEL, "" if level is None else str(level), commit=commit)


def delete_setting(key: str, *, commit: bool = False) -> None:
    row = db.session.get(Setting, key)
    if row is not None:
        db.session.delete(row)
    if commit:
        db.session.commit()
    else:
        db.session.flush()
