"""Shared PostgreSQL test harness for backend ORM / integration tests."""

from __future__ import annotations

import unittest

from flask import Flask
from sqlalchemy import text

from backend.db_config import resolve_test_database_url
from backend.extensions import db

_SCHEMA_READY = False

# Keep in sync with backend.models metadata (quote reserved names).
_TRUNCATE_TABLES = (
    "character_word",
    "hsk_word_character",
    '"character"',
    "words",
    "hsk_words",
    "hsk_characters",
    "settings",
    "ignore_vocab_card",
    "ignore_writting_card",
    "token_count",
)


def run_alembic_upgrade(database_url: str) -> None:
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    repo_root = Path(__file__).resolve().parents[2]
    config = Config(str(repo_root / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")


def truncate_all_tables() -> None:
    db.session.execute(
        text(f"TRUNCATE {', '.join(_TRUNCATE_TABLES)} RESTART IDENTITY CASCADE")
    )
    db.session.commit()


class PostgresTestCase(unittest.TestCase):
    """Flask app bound to ``TEST_DATABASE_URL`` with a clean schema each test."""

    def setUp(self) -> None:
        global _SCHEMA_READY

        self.app = Flask(__name__)
        self.app.config["SQLALCHEMY_DATABASE_URI"] = resolve_test_database_url()
        self.app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
        db.init_app(self.app)
        self.app_context = self.app.app_context()
        self.app_context.push()

        if not _SCHEMA_READY:
            import backend.models  # noqa: F401

            run_alembic_upgrade(resolve_test_database_url())
            _SCHEMA_READY = True

        truncate_all_tables()

    def tearDown(self) -> None:
        db.session.remove()
        self.app_context.pop()
