"""Database configuration and initialization.

PostgreSQL schema is managed by Alembic. Seed / data helpers run after upgrade.
"""

from __future__ import annotations

from flask import Flask

from backend.db_config import resolve_database_url
from backend.extensions import db


def configure_database(app: Flask) -> None:
    app.config["SQLALCHEMY_DATABASE_URI"] = resolve_database_url()
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)


def _run_alembic_upgrade(database_url: str | None = None) -> None:
    """Apply pending Alembic revisions."""
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    repo_root = Path(__file__).resolve().parents[1]
    config = Config(str(repo_root / "alembic.ini"))
    config.set_main_option(
        "sqlalchemy.url",
        database_url or resolve_database_url(),
    )
    command.upgrade(config, "head")


def _migrate_settings_token_keys_to_token_count() -> None:
    """Move legacy token settings into the token_count table."""
    import json
    from datetime import datetime, timezone

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
                    try:
                        recorded_at = datetime.fromisoformat(ts_raw)
                    except ValueError:
                        continue
                    if recorded_at.tzinfo is None:
                        recorded_at = recorded_at.replace(tzinfo=timezone.utc)
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
        if db.engine.dialect.name != "postgresql":
            raise RuntimeError(
                f"Unsupported database dialect {db.engine.dialect.name!r}; "
                "Teacher Wang requires PostgreSQL."
            )
        _run_alembic_upgrade()

        _ensure_hsk_content_loaded()
        _ensure_settings()
        _migrate_settings_token_keys_to_token_count()
        from backend.anki_sync import _migrate_pull_ignored_settings_to_tables

        _migrate_pull_ignored_settings_to_tables()
