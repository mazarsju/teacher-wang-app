"""Unit tests for database URL resolution (no Postgres required)."""

from __future__ import annotations

import os
import unittest
from unittest import mock

from backend.db_config import resolve_database_url


class TestResolveDatabaseUrl(unittest.TestCase):
    def test_prefers_database_url(self):
        with mock.patch("backend.db_config.load_database_env"):
            with mock.patch.dict(
                os.environ,
                {
                    "DATABASE_URL": "postgresql+psycopg://u:p@localhost:5432/app",
                    "DB_HOST": "ignored.example",
                },
                clear=False,
            ):
                self.assertEqual(
                    resolve_database_url(),
                    "postgresql+psycopg://u:p@localhost:5432/app",
                )

    def test_builds_url_from_db_parts(self):
        env = {
            "DB_HOST": "db.example",
            "DB_PORT": "5432",
            "DB_NAME": "teacherwang",
            "DB_USER": "teacherwang",
            "DB_PASSWORD": "s3cret/with@chars",
        }
        with mock.patch("backend.db_config.load_database_env"):
            with mock.patch.dict(os.environ, env, clear=True):
                url = resolve_database_url()
        self.assertEqual(
            url,
            "postgresql+psycopg://teacherwang:s3cret%2Fwith%40chars"
            "@db.example:5432/teacherwang",
        )

    def test_raises_when_unconfigured(self):
        with mock.patch("backend.db_config.load_database_env"):
            with mock.patch.dict(os.environ, {}, clear=True):
                with self.assertRaises(RuntimeError):
                    resolve_database_url()


if __name__ == "__main__":
    unittest.main()
