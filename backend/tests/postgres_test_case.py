"""Shared PostgreSQL test harness for backend ORM / integration tests."""

from __future__ import annotations

import unittest

from flask import Flask
from sqlalchemy import text

from backend.utils.database.alembic_runner import run_alembic_upgrade
from backend.utils.database.db_config import resolve_test_database_url
from backend.utils.database.extensions import db

_SCHEMA_READY = False

TEST_USER_ID = "test-user"
TEST_USERNAME = "test"
TEST_EMAIL = "test@example.com"

# Keep in sync with backend.utils.database.models metadata (quote reserved names).
# users comes first: every private table references it.
_TRUNCATE_TABLES = (
    "users",
    "hsk_word_character",
    '"character"',
    "words",
    "hsk_words",
    "hsk_characters",
    "settings",
    "ignore_vocab_card",
    "ignore_writing_card",
    "ignore_hsk_words",
    "token_count",
    "challenge_progress",
    "writing_progress",
    "conversation_summary",
    "weekly_articles",
    "user_grammar_progress",
    "grammar_prerequisites",
    "grammar_points",
)


def truncate_all_tables() -> None:
    db.session.execute(
        text(f"TRUNCATE {', '.join(_TRUNCATE_TABLES)} RESTART IDENTITY CASCADE")
    )
    db.session.commit()


def create_test_user(
    user_id: str = TEST_USER_ID,
    username: str = TEST_USERNAME,
    email: str = TEST_EMAIL,
):
    """Insert a ``users`` row so private-table fixtures satisfy their FK."""
    from backend.utils.database.models import User, utcnow

    user = User(
        id=user_id,
        username=username,
        email=email,
        last_connection=utcnow(),
    )
    db.session.add(user)
    db.session.commit()
    return user


class PostgresTestCase(unittest.TestCase):
    """Flask app bound to ``TEST_DATABASE_URL`` with a clean schema each test.

    Every test starts with one ``users`` row (``TEST_USER_ID`` Cognito sub).
    Private-table fixtures must set ``user_id`` to ``self.user_id`` (shortid).
    """

    cognito_sub = TEST_USER_ID

    def setUp(self) -> None:
        global _SCHEMA_READY

        self.app = Flask(__name__)
        self.app.config["SQLALCHEMY_DATABASE_URI"] = resolve_test_database_url()
        self.app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
        db.init_app(self.app)
        self.app_context = self.app.app_context()
        self.app_context.push()

        if not _SCHEMA_READY:
            import backend.utils.database.models  # noqa: F401

            run_alembic_upgrade(resolve_test_database_url())
            _SCHEMA_READY = True

        truncate_all_tables()
        self.user = create_test_user(self.cognito_sub)
        self.user_id = self.user.shortid

    def tearDown(self) -> None:
        db.session.remove()
        self.app_context.pop()
