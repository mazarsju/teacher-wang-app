"""Unit tests for Alembic config helpers (no Postgres required)."""

from __future__ import annotations

import bootstrap  # noqa: F401
import unittest
from unittest import mock

from alembic.config import Config

from backend.utils.database.alembic_runner import (
    SQLALCHEMY_URL_ATTRIBUTE,
    make_alembic_config,
)
from backend.utils.database.db_config import resolve_database_url


class TestMakeAlembicConfig(unittest.TestCase):
    def test_stores_percent_encoded_password_without_configparser_error(self):
        # quote_plus turns special chars into %XX; ConfigParser.set_main_option
        # would raise ValueError on those. attributes must accept them as-is.
        url = (
            "postgresql+psycopg://teacherwang:"
            "p%3Eass%21w%5Bord%40x%2F"
            "@db.example:5432/teacherwang"
        )
        config = make_alembic_config(url)
        self.assertIsInstance(config, Config)
        self.assertEqual(config.attributes[SQLALCHEMY_URL_ATTRIBUTE], url)

    def test_set_main_option_still_rejects_percent_encoded_url(self):
        """Document why we avoid set_main_option for sqlalchemy.url."""
        url = "postgresql+psycopg://u:p%40ss@localhost:5432/db"
        config = Config()
        with self.assertRaises(ValueError) as ctx:
            config.set_main_option("sqlalchemy.url", url)
        self.assertIn("interpolation", str(ctx.exception).lower())

    def test_defaults_to_resolve_database_url(self):
        with mock.patch(
            "backend.utils.database.alembic_runner.resolve_database_url",
            return_value="postgresql+psycopg://u:p@localhost:5432/app",
        ):
            config = make_alembic_config()
        self.assertEqual(
            config.attributes[SQLALCHEMY_URL_ATTRIBUTE],
            "postgresql+psycopg://u:p@localhost:5432/app",
        )

    def test_db_parts_url_with_special_password_is_safe_for_alembic_config(self):
        env = {
            "DB_HOST": "db.example",
            "DB_PORT": "5432",
            "DB_NAME": "teacherwang",
            "DB_USER": "teacherwang",
            "DB_PASSWORD": "p>ass!w[ord@x/",
        }
        with mock.patch("backend.utils.database.db_config.load_database_env"):
            with mock.patch.dict("os.environ", env, clear=True):
                url = resolve_database_url()
        config = make_alembic_config(url)
        self.assertEqual(config.attributes[SQLALCHEMY_URL_ATTRIBUTE], url)
        self.assertIn("%", url)


if __name__ == "__main__":
    unittest.main()
