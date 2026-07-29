"""Resolve the SQLAlchemy database URL.

Preference order:
1. ``DATABASE_PATH`` — local SQLite file (Tauri desktop)
2. ``DATABASE_URL`` — full SQLAlchemy URL (Postgres for local/web dev)
"""

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

    database_path = os.environ.get("DATABASE_PATH")
    if database_path:
        return f"sqlite:///{database_path}"

    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return database_url

    raise RuntimeError(
        "No database configured. Copy .env.example to .env and set DATABASE_URL "
        "for PostgreSQL, or set DATABASE_PATH for a SQLite file (desktop)."
    )
