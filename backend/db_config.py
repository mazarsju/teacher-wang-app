"""Resolve SQLAlchemy database URLs from the environment / ``.env``."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[1]


def load_database_env() -> None:
    """Load repo-root ``.env`` without overriding already-set process env vars."""
    load_dotenv(_REPO_ROOT / ".env", override=False)


def resolve_database_url() -> str:
    load_database_env()

    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return database_url

    raise RuntimeError(
        "No database configured. Copy .env.example to .env and set DATABASE_URL "
        "(PostgreSQL)."
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
