"""Per-user key/value settings (e.g. HSK level)."""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError

from backend.utils.database.extensions import db
from backend.utils.database.models import Setting

SETTING_LEVEL = "level"
SETTING_ANKI_SYNCHRONIZATION_STATUS = "anki_synchronization_status"
SETTING_ANKI_MANDARIN_VOCABULARY_DECK = "anki_mandarin_vocabulary_deck"
SETTING_ANKI_MANDARIN_VOCABULARY_MODEL = "anki_mandarin_vocabulary_model"
SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS = "anki_mandarin_vocabulary_fields"
SETTING_ANKI_MANDARIN_VOCABULARY_CUSTOM_FIELDS = (
    "anki_mandarin_vocabulary_custom_fields"
)
SETTING_ANKI_MANDARIN_VOCABULARY_PULL_IGNORED = (
    "anki_mandarin_vocabulary_pull_ignored"
)
SETTING_ANKI_MANDARIN_WRITING_DECK = "anki_mandarin_writing_deck"
SETTING_ANKI_MANDARIN_WRITING_MODEL = "anki_mandarin_writing_model"
SETTING_ANKI_MANDARIN_WRITING_FIELDS = "anki_mandarin_writing_fields"
SETTING_ANKI_MANDARIN_WRITING_PULL_IGNORED = (
    "anki_mandarin_writing_pull_ignored"
)
SETTING_AVAILABLE_TOKEN = "available_token"
SETTING_SMART_AI_ENABLED = "smart_ai_enabled"
SETTING_CHAT_LISTENING_MODE = "chat_listening_mode"
SETTING_CHAT_LISTEN_SPEED_ADJUSTMENT = "chat_listen_speed_adjustment"

CHAT_LISTENING_MODE_READING_FIRST = "reading_first"
CHAT_LISTENING_MODE_LISTENING_FIRST = "listening_first"
CHAT_LISTENING_MODES = {
    CHAT_LISTENING_MODE_READING_FIRST,
    CHAT_LISTENING_MODE_LISTENING_FIRST,
}
CHAT_LISTEN_SPEED_ADJUSTMENTS = {-20, -10, 0, 10, 20}

FREE_PLAN_MAX_ALLOWED_TOKEN = 100_000
PRO_PLAN_TOKEN_GRANT = 10_000_000
FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE = (
    "Sorry, you've used up the tokens included with your free plan. "
    "If you're enjoying chat, consider upgrading to a paid account!"
)
PRO_PLAN_TOKEN_EXHAUSTED_MESSAGE = (
    "Sorry, you've used up your plan's token allowance for now. "
    "It will refill at the start of next month."
)

ADMIN_EMAIL = "mazarsju@gmail.com"

LEGACY_SETTING_MIGRATIONS: tuple[tuple[str, str], ...] = (
    ("anki_character_deck", SETTING_ANKI_MANDARIN_WRITING_DECK),
    ("anki_characters_deck", SETTING_ANKI_MANDARIN_WRITING_DECK),
    ("anki_characters_model", SETTING_ANKI_MANDARIN_WRITING_MODEL),
    ("anki_characters_fields", SETTING_ANKI_MANDARIN_WRITING_FIELDS),
    ("anki_words_deck", SETTING_ANKI_MANDARIN_VOCABULARY_DECK),
    ("anki_words_model", SETTING_ANKI_MANDARIN_VOCABULARY_MODEL),
    ("anki_words_fields", SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS),
    ("anki_mandarin_writting_deck", SETTING_ANKI_MANDARIN_WRITING_DECK),
    ("anki_mandarin_writting_model", SETTING_ANKI_MANDARIN_WRITING_MODEL),
    ("anki_mandarin_writting_fields", SETTING_ANKI_MANDARIN_WRITING_FIELDS),
    (
        "anki_mandarin_writting_pull_ignored",
        SETTING_ANKI_MANDARIN_WRITING_PULL_IGNORED,
    ),
)

DEFAULT_SETTINGS: dict[str, str] = {
    SETTING_LEVEL: "",
    SETTING_ANKI_SYNCHRONIZATION_STATUS: "not_synchronized",
    SETTING_ANKI_MANDARIN_VOCABULARY_DECK: "",
    SETTING_ANKI_MANDARIN_VOCABULARY_MODEL: "",
    SETTING_ANKI_MANDARIN_VOCABULARY_FIELDS: "",
    SETTING_ANKI_MANDARIN_VOCABULARY_CUSTOM_FIELDS: "[]",
    SETTING_ANKI_MANDARIN_VOCABULARY_PULL_IGNORED: "[]",
    SETTING_ANKI_MANDARIN_WRITING_DECK: "",
    SETTING_ANKI_MANDARIN_WRITING_MODEL: "",
    SETTING_ANKI_MANDARIN_WRITING_FIELDS: "",
    SETTING_ANKI_MANDARIN_WRITING_PULL_IGNORED: "[]",
    SETTING_AVAILABLE_TOKEN: str(FREE_PLAN_MAX_ALLOWED_TOKEN),
    SETTING_SMART_AI_ENABLED: "true",
    SETTING_CHAT_LISTENING_MODE: CHAT_LISTENING_MODE_READING_FIRST,
    SETTING_CHAT_LISTEN_SPEED_ADJUSTMENT: "0",
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

    # INSERT .. ON CONFLICT so parallel login requests do not 500 on the PK.
    for key, default_value in DEFAULT_SETTINGS.items():
        db.session.execute(
            insert(Setting)
            .values(user_id=user_id, key=key, value=default_value)
            .on_conflict_do_nothing(index_elements=["user_id", "key"])
        )
    try:
        if commit:
            db.session.commit()
        else:
            db.session.flush()
    except IntegrityError:
        # Legacy rename races (or a peer commit) — defaults are already present.
        db.session.rollback()
        if not commit:
            raise


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


def get_smart_ai_enabled(user_id: str) -> bool:
    return get_setting(user_id, SETTING_SMART_AI_ENABLED, "true") == "true"


def set_smart_ai_enabled(user_id: str, enabled: bool, *, commit: bool = True) -> None:
    ensure_default_settings(user_id, commit=False)
    set_setting(
        user_id,
        SETTING_SMART_AI_ENABLED,
        "true" if enabled else "false",
        commit=commit,
    )


def get_chat_listening_mode(user_id: str) -> str:
    return get_setting(user_id, SETTING_CHAT_LISTENING_MODE, CHAT_LISTENING_MODE_READING_FIRST)


def set_chat_listening_mode(user_id: str, mode: str, *, commit: bool = True) -> None:
    ensure_default_settings(user_id, commit=False)
    set_setting(user_id, SETTING_CHAT_LISTENING_MODE, mode, commit=commit)


def get_chat_listen_speed_adjustment(user_id: str) -> int:
    raw = get_setting(user_id, SETTING_CHAT_LISTEN_SPEED_ADJUSTMENT, "0")
    try:
        return int(raw)
    except ValueError:
        return 0


def set_chat_listen_speed_adjustment(
    user_id: str, adjustment: int, *, commit: bool = True
) -> None:
    ensure_default_settings(user_id, commit=False)
    set_setting(
        user_id, SETTING_CHAT_LISTEN_SPEED_ADJUSTMENT, str(adjustment), commit=commit
    )


def delete_setting(user_id: str, key: str, *, commit: bool = False) -> None:
    row = db.session.get(Setting, (user_id, key))
    if row is not None:
        db.session.delete(row)
    if commit:
        db.session.commit()
    else:
        db.session.flush()


def get_available_token(user_id: str) -> int:
    ensure_default_settings(user_id, commit=False)
    raw = get_setting(
        user_id,
        SETTING_AVAILABLE_TOKEN,
        str(FREE_PLAN_MAX_ALLOWED_TOKEN),
    )
    try:
        return int(raw)
    except ValueError:
        return 0


def assert_plan_has_tokens(user) -> None:
    """Raise if the user has no tokens left for another LLM call.

    Every plan is capped (free at ``FREE_PLAN_MAX_ALLOWED_TOKEN``, everything
    else at the higher ``PRO_PLAN_TOKEN_GRANT``, both via
    ``reset_available_token``) — only the admin account is unmetered.
    """
    from backend.utils.database.models import DEFAULT_USER_PLAN

    if user.email == ADMIN_EMAIL:
        return
    if get_available_token(user.shortid) <= 0:
        message = (
            FREE_PLAN_TOKEN_EXHAUSTED_MESSAGE
            if user.plan == DEFAULT_USER_PLAN
            else PRO_PLAN_TOKEN_EXHAUSTED_MESSAGE
        )
        raise ValueError(message)


def reset_available_token(user_id: str, plan: str, *, commit: bool = True) -> None:
    """Refill available_token to the plan's monthly grant."""
    grant = PRO_PLAN_TOKEN_GRANT if plan == "pro" else FREE_PLAN_MAX_ALLOWED_TOKEN
    set_setting(user_id, SETTING_AVAILABLE_TOKEN, str(grant), commit=commit)


def deduct_available_token(user_id: str, used: int, *, commit: bool = True) -> int:
    """Subtract ``used`` from available_token. May go negative."""
    if used <= 0:
        return get_available_token(user_id)
    remaining = get_available_token(user_id) - used
    set_setting(
        user_id,
        SETTING_AVAILABLE_TOKEN,
        str(remaining),
        commit=commit,
    )
    return remaining
