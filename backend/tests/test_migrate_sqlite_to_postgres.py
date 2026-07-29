import bootstrap  # noqa: F401
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine, text

from backend.sqlite_postgres_migrate import (
    as_bool,
    as_datetime,
    clear_user_data,
    copy_user_data,
)


def _create_source_schema(engine) -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE "character" (
                    char TEXT PRIMARY KEY,
                    pinyin VARCHAR(6) NOT NULL,
                    writting_known BOOLEAN NOT NULL,
                    synchronized BOOLEAN NOT NULL,
                    updated_at DATETIME NOT NULL
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE words (
                    word VARCHAR(10) PRIMARY KEY,
                    definition VARCHAR(100),
                    synchronized BOOLEAN NOT NULL,
                    updated_at DATETIME NOT NULL
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE character_word (
                    character_char TEXT NOT NULL,
                    word VARCHAR(10) NOT NULL,
                    PRIMARY KEY (character_char, word)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE settings (
                    key VARCHAR(64) PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE ignore_vocab_card (
                    writting TEXT PRIMARY KEY
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE ignore_writting_card (
                    recto TEXT PRIMARY KEY
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE token_count (
                    recorded_at DATETIME NOT NULL,
                    type VARCHAR(16) NOT NULL,
                    tokens INTEGER NOT NULL,
                    price NUMERIC(20, 5) NOT NULL DEFAULT 0,
                    PRIMARY KEY (recorded_at, type)
                )
                """
            )
        )


class TestSqliteToPostgresHelpers(unittest.TestCase):
    def test_as_bool_and_datetime(self):
        self.assertTrue(as_bool(1))
        self.assertFalse(as_bool(0))
        self.assertTrue(as_bool("true"))
        aware = as_datetime("2026-01-02T03:04:05")
        self.assertEqual(aware.tzinfo, timezone.utc)

    def test_copy_user_data_between_sqlite_engines(self):
        with tempfile.TemporaryDirectory() as tmp:
            source_path = Path(tmp) / "source.db"
            target_path = Path(tmp) / "target.db"
            source = create_engine(f"sqlite:///{source_path}")
            target = create_engine(f"sqlite:///{target_path}")
            _create_source_schema(source)
            _create_source_schema(target)

            now = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
            with source.begin() as connection:
                connection.execute(
                    text(
                        'INSERT INTO "character" '
                        "(char, pinyin, writting_known, synchronized, updated_at) "
                        "VALUES ('好', 'hao3', 1, 0, :updated_at)"
                    ),
                    {"updated_at": now.isoformat()},
                )
                connection.execute(
                    text(
                        "INSERT INTO words "
                        "(word, definition, synchronized, updated_at) "
                        "VALUES ('你好', 'hello', 0, :updated_at)"
                    ),
                    {"updated_at": now.isoformat()},
                )
                connection.execute(
                    text(
                        "INSERT INTO character_word (character_char, word) "
                        "VALUES ('好', '你好')"
                    )
                )
                connection.execute(
                    text(
                        "INSERT INTO settings (key, value) "
                        "VALUES ('level', '2')"
                    )
                )
                connection.execute(
                    text(
                        "INSERT INTO ignore_vocab_card (writting) VALUES ('稀有')"
                    )
                )
                connection.execute(
                    text(
                        "INSERT INTO ignore_writting_card (recto) "
                        "VALUES ('def (pinyin)')"
                    )
                )
                connection.execute(
                    text(
                        "INSERT INTO token_count "
                        "(recorded_at, type, tokens, price) "
                        "VALUES (:recorded_at, 'input', 12, 0.5)"
                    ),
                    {"recorded_at": now.isoformat()},
                )

            clear_user_data(target)
            counts = copy_user_data(source, target)
            self.assertEqual(counts["character"], 1)
            self.assertEqual(counts["words"], 1)
            self.assertEqual(counts["character_word"], 1)
            self.assertEqual(counts["settings"], 1)
            self.assertEqual(counts["ignore_vocab_card"], 1)
            self.assertEqual(counts["ignore_writting_card"], 1)
            self.assertEqual(counts["token_count"], 1)

            with target.connect() as connection:
                level = connection.execute(
                    text("SELECT value FROM settings WHERE key = 'level'")
                ).scalar_one()
                self.assertEqual(level, "2")
                char = connection.execute(
                    text('SELECT pinyin FROM "character" WHERE char = \'好\'')
                ).scalar_one()
                self.assertEqual(char, "hao3")

            source.dispose()
            target.dispose()


if __name__ == "__main__":
    unittest.main()
