import os

from flask import Flask
from sqlalchemy import inspect, text

from backend.extensions import db


def configure_database(app: Flask) -> None:
    db_path = os.environ.get(
        "DATABASE_PATH",
        os.path.join(os.path.dirname(__file__), "learn_mandarin.db"),
    )
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)


def _migrate_updated_at_columns() -> None:
    inspector = inspect(db.engine)
    tables = ("character", "words")

    for table_name in tables:
        column_names = {column["name"] for column in inspector.get_columns(table_name)}
        if "updated_at" in column_names:
            continue

        db.session.execute(
            text(f"ALTER TABLE {table_name} ADD COLUMN updated_at DATETIME")
        )
        db.session.execute(
            text(
                f"UPDATE {table_name} "
                "SET updated_at = CURRENT_TIMESTAMP "
                "WHERE updated_at IS NULL"
            )
        )

    db.session.commit()


def _migrate_drop_legacy_hsk_vocabulary() -> None:
    """Drop the old hsk_vocabulary table so content reloads into the new schema."""
    inspector = inspect(db.engine)
    if "hsk_vocabulary" not in inspector.get_table_names():
        return

    db.session.execute(text("DROP TABLE hsk_vocabulary"))
    db.session.commit()


def _migrate_hsk_words_level() -> None:
    """Add level to hsk_words and clear HSK tables so they reload with values."""
    inspector = inspect(db.engine)
    if "hsk_words" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("hsk_words")}
    if "level" in column_names:
        return

    db.session.execute(text("ALTER TABLE hsk_words ADD COLUMN level INTEGER"))
    db.session.execute(text("DELETE FROM hsk_word_character"))
    db.session.execute(text("DELETE FROM hsk_words"))
    db.session.execute(text("DELETE FROM hsk_characters"))
    db.session.commit()


def _migrate_learner_profile_to_settings() -> None:
    """Replace singleton learner_profile with key/value settings."""
    from backend.models import Setting
    from backend.settings import (
        SETTING_LEVEL,
        ensure_default_settings,
        set_setting,
    )

    ensure_default_settings(commit=False)

    inspector = inspect(db.engine)
    if "learner_profile" not in inspector.get_table_names():
        db.session.commit()
        return

    row = db.session.execute(
        text("SELECT current_hsk_level FROM learner_profile LIMIT 1")
    ).first()
    if row is not None and row[0] is not None:
        existing = db.session.get(Setting, SETTING_LEVEL)
        if existing is None or existing.value.strip() == "":
            set_setting(SETTING_LEVEL, str(row[0]))

    db.session.execute(text("DROP TABLE learner_profile"))
    db.session.commit()


def _migrate_token_count_add_type() -> None:
    """Add token_count.type and switch to (recorded_at, type) primary key."""
    inspector = inspect(db.engine)
    if "token_count" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("token_count")}
    if "type" in column_names:
        return

    db.session.execute(
        text(
            """
            CREATE TABLE token_count_new (
                recorded_at DATETIME NOT NULL,
                type VARCHAR(16) NOT NULL,
                tokens INTEGER NOT NULL,
                price NUMERIC(20, 5) NOT NULL DEFAULT 0,
                PRIMARY KEY (recorded_at, type)
            )
            """
        )
    )
    db.session.execute(
        text(
            """
            INSERT INTO token_count_new (recorded_at, type, tokens, price)
            SELECT recorded_at, 'input', tokens, 0 FROM token_count
            """
        )
    )
    db.session.execute(text("DROP TABLE token_count"))
    db.session.execute(text("ALTER TABLE token_count_new RENAME TO token_count"))
    db.session.commit()


def _migrate_token_count_add_price() -> None:
    """Add price (USD cents, 5 decimal places) to token_count."""
    inspector = inspect(db.engine)
    if "token_count" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("token_count")}
    if "price" in column_names:
        return

    db.session.execute(
        text(
            "ALTER TABLE token_count "
            "ADD COLUMN price NUMERIC(20, 5) NOT NULL DEFAULT 0"
        )
    )
    db.session.commit()


def _migrate_settings_token_keys_to_token_count() -> None:
    """Move legacy token settings into the token_count table."""
    import json
    from datetime import datetime, timedelta, timezone

    from backend.models import Setting, TokenCount
    from backend.settings import LEGACY_TOKEN_SETTING_KEYS, delete_setting
    from backend.token_usage import TOKEN_TYPE_INPUT

    if TokenCount.query.first() is None:
        events_row = db.session.get(Setting, "tk_events")
        migrated = False

        if events_row is not None and events_row.value.strip():
            try:
                payload = json.loads(events_row.value)
            except json.JSONDecodeError:
                payload = []

            if isinstance(payload, list):
                for item in payload:
                    if not isinstance(item, dict):
                        continue
                    ts_raw = item.get("ts")
                    tokens = item.get("tokens")
                    if not isinstance(ts_raw, str) or not isinstance(tokens, int):
                        continue
                    if tokens <= 0:
                        continue
                    try:
                        recorded_at = datetime.fromisoformat(ts_raw)
                    except ValueError:
                        continue
                    if recorded_at.tzinfo is None:
                        recorded_at = recorded_at.replace(tzinfo=timezone.utc)
                    while (
                        db.session.get(TokenCount, (recorded_at, TOKEN_TYPE_INPUT))
                        is not None
                    ):
                        recorded_at = recorded_at + timedelta(microseconds=1)
                    db.session.add(
                        TokenCount(
                            recorded_at=recorded_at,
                            type=TOKEN_TYPE_INPUT,
                            tokens=tokens,
                            price=0,
                        )
                    )
                    migrated = True

        if not migrated:
            total_row = db.session.get(Setting, "total_tk")
            if (
                total_row is not None
                and total_row.value.strip().isdigit()
                and int(total_row.value) > 0
            ):
                recorded_at = datetime.now(timezone.utc)
                db.session.add(
                    TokenCount(
                        recorded_at=recorded_at,
                        type=TOKEN_TYPE_INPUT,
                        tokens=int(total_row.value),
                        price=0,
                    )
                )

    for key in LEGACY_TOKEN_SETTING_KEYS:
        delete_setting(key)

    db.session.commit()


def _ensure_hsk_content_loaded() -> None:
    from backend.models import HskWord
    from backend.routes.hsk_content_loader import load_hsk_content

    if HskWord.query.first() is not None:
        return

    load_hsk_content()


def _ensure_settings() -> None:
    from backend.hsk_level import refresh_current_hsk_level
    from backend.settings import SETTING_LEVEL, ensure_default_settings, get_setting

    ensure_default_settings(commit=False)
    if get_setting(SETTING_LEVEL, "").strip() == "":
        refresh_current_hsk_level(commit=True)
    else:
        db.session.commit()


def init_db(app: Flask) -> None:
    import backend.models  # noqa: F401

    with app.app_context():
        db.create_all()
        _migrate_updated_at_columns()
        _migrate_drop_legacy_hsk_vocabulary()
        _migrate_hsk_words_level()
        _migrate_learner_profile_to_settings()
        _migrate_token_count_add_type()
        _migrate_token_count_add_price()
        _migrate_settings_token_keys_to_token_count()
        _ensure_hsk_content_loaded()
        _ensure_settings()
