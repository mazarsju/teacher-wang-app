"""Resolve SQLAlchemy database URLs from the environment / ``.env``."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[3]


def load_database_env() -> None:
    """Load repo-root ``.env`` without overriding already-set process env vars."""
    load_dotenv(_REPO_ROOT / ".env", override=False)


def _database_url_from_parts() -> str | None:
    """Build a URL from ECS-style ``DB_*`` variables when ``DATABASE_URL`` is unset."""
    host = os.environ.get("DB_HOST")
    if not host:
        return None

    user = os.environ.get("DB_USER", "")
    password = os.environ.get("DB_PASSWORD", "")
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "")
    return (
        f"postgresql+psycopg://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{name}"
    )


def resolve_database_url() -> str:
    load_database_env()

    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return database_url

    from_parts = _database_url_from_parts()
    if from_parts:
        return from_parts

    raise RuntimeError(
        "No database configured. Copy .env.example to .env and set DATABASE_URL "
        "(PostgreSQL), or set DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD "
        "(ECS)."
    )


def resolve_test_database_url() -> str:
    """URL for backend unit/integration tests (never the primary app database)."""
    load_database_env()

    database_url = os.environ.get("TEST_DATABASE_URL")
    if database_url:
        return database_url

    raise RuntimeError(
        "TEST_DATABASE_URL is required for backend tests. "
        "Copy .env.example to .env and set TEST_DATABASE_URL to a dedicated "
        "Postgres database (for example teacher_wang_test)."
    )
