"""Database configuration and initialization.

PostgreSQL schema is managed by Alembic. Boot only touches shared data (HSK);
per-user rows are seeded lazily on the first authenticated request.
"""

from __future__ import annotations

from flask import Flask

from backend.utils.database.db_config import resolve_database_url
from backend.utils.database.extensions import db


def configure_database(app: Flask) -> None:
    app.config["SQLALCHEMY_DATABASE_URI"] = resolve_database_url()
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)


def _run_alembic_upgrade(database_url: str | None = None) -> None:
    """Apply pending Alembic revisions."""
    from backend.utils.database.alembic_runner import run_alembic_upgrade

    run_alembic_upgrade(database_url)


def _ensure_hsk_content_loaded() -> None:
    from backend.utils.database.models import HskWord
    from backend.utils.knowledgeBase.hsk_content_loader import load_hsk_content

    if HskWord.query.first() is not None:
        return

    load_hsk_content()


def init_db(app: Flask) -> None:
    import backend.utils.database.models  # noqa: F401

    with app.app_context():
        if db.engine.dialect.name != "postgresql":
            raise RuntimeError(
                f"Unsupported database dialect {db.engine.dialect.name!r}; "
                "Teacher Wang requires PostgreSQL."
            )
        _run_alembic_upgrade()
        _ensure_hsk_content_loaded()
