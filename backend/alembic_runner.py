"""Programmatic Alembic helpers shared by app startup and tests."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from backend.db_config import resolve_database_url

# Stored on Config.attributes so URL-encoded passwords (with `%`) never go
# through ConfigParser.set_main_option, which treats `%` as interpolation.
SQLALCHEMY_URL_ATTRIBUTE = "sqlalchemy_url"

_REPO_ROOT = Path(__file__).resolve().parents[1]


def make_alembic_config(database_url: str | None = None) -> Config:
    """Build an Alembic ``Config`` with an explicit SQLAlchemy URL override."""
    config = Config(str(_REPO_ROOT / "alembic.ini"))
    config.attributes[SQLALCHEMY_URL_ATTRIBUTE] = (
        database_url or resolve_database_url()
    )
    return config


def run_alembic_upgrade(database_url: str | None = None) -> None:
    """Apply pending Alembic revisions to ``head``."""
    command.upgrade(make_alembic_config(database_url), "head")
