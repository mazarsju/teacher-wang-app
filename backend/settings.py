"""Key/value application settings (e.g. HSK level)."""

from __future__ import annotations

from backend.extensions import db
from backend.models import Setting

SETTING_LEVEL = "level"

DEFAULT_SETTINGS: dict[str, str] = {
    SETTING_LEVEL: "",
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
