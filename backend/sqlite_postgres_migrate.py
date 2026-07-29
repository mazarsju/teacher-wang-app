"""One-shot copy of learner data from a SQLite file into PostgreSQL.

HSK reference tables are left alone (seeded on Postgres startup). Copies:
character, words, character_word, settings, ignore_*, token_count.

Target learner tables are cleared first, then refilled from SQLite.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, Row

USER_TABLES_DELETE_ORDER = (
    "character_word",
    "words",
    "character",
    "token_count",
    "ignore_vocab_card",
    "ignore_writting_card",
    "settings",
)


def as_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "t", "yes"}
    return bool(value)


def as_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    raise TypeError(f"Unsupported datetime value: {value!r}")


def as_decimal(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _fetch_all(engine: Engine, sql: str) -> list[Row]:
    with engine.connect() as connection:
        return list(connection.execute(text(sql)))


def clear_user_data(target: Engine) -> None:
    with target.begin() as connection:
        for table in USER_TABLES_DELETE_ORDER:
            connection.execute(text(f"DELETE FROM {table}"))


def copy_user_data(source: Engine, target: Engine) -> dict[str, int]:
    """Copy learner tables from ``source`` (SQLite) into ``target`` (Postgres)."""
    counts: dict[str, int] = {}

    characters = _fetch_all(
        source,
        "SELECT char, pinyin, writting_known, synchronized, updated_at "
        'FROM "character"',
    )
    words = _fetch_all(
        source,
        "SELECT word, definition, synchronized, updated_at FROM words",
    )
    links = _fetch_all(
        source,
        "SELECT character_char, word FROM character_word",
    )
    settings = _fetch_all(source, "SELECT key, value FROM settings")
    ignore_vocab = _fetch_all(source, "SELECT writting FROM ignore_vocab_card")
    ignore_writting = _fetch_all(source, "SELECT recto FROM ignore_writting_card")
    tokens = _fetch_all(
        source,
        "SELECT recorded_at, type, tokens, price FROM token_count",
    )

    with target.begin() as connection:
        for row in characters:
            connection.execute(
                text(
                    'INSERT INTO "character" '
                    "(char, pinyin, writting_known, synchronized, updated_at) "
                    "VALUES (:char, :pinyin, :writting_known, :synchronized, "
                    ":updated_at)"
                ),
                {
                    "char": row.char,
                    "pinyin": row.pinyin,
                    "writting_known": as_bool(row.writting_known),
                    "synchronized": as_bool(row.synchronized),
                    "updated_at": as_datetime(row.updated_at),
                },
            )
        counts["character"] = len(characters)

        for row in words:
            connection.execute(
                text(
                    "INSERT INTO words "
                    "(word, definition, synchronized, updated_at) "
                    "VALUES (:word, :definition, :synchronized, :updated_at)"
                ),
                {
                    "word": row.word,
                    "definition": row.definition,
                    "synchronized": as_bool(row.synchronized),
                    "updated_at": as_datetime(row.updated_at),
                },
            )
        counts["words"] = len(words)

        for row in links:
            connection.execute(
                text(
                    "INSERT INTO character_word (character_char, word) "
                    "VALUES (:character_char, :word)"
                ),
                {"character_char": row.character_char, "word": row.word},
            )
        counts["character_word"] = len(links)

        for row in settings:
            connection.execute(
                text("INSERT INTO settings (key, value) VALUES (:key, :value)"),
                {"key": row.key, "value": row.value},
            )
        counts["settings"] = len(settings)

        for row in ignore_vocab:
            connection.execute(
                text(
                    "INSERT INTO ignore_vocab_card (writting) VALUES (:writting)"
                ),
                {"writting": row.writting},
            )
        counts["ignore_vocab_card"] = len(ignore_vocab)

        for row in ignore_writting:
            connection.execute(
                text(
                    "INSERT INTO ignore_writting_card (recto) VALUES (:recto)"
                ),
                {"recto": row.recto},
            )
        counts["ignore_writting_card"] = len(ignore_writting)

        for row in tokens:
            connection.execute(
                text(
                    "INSERT INTO token_count (recorded_at, type, tokens, price) "
                    "VALUES (:recorded_at, :type, :tokens, :price)"
                ),
                {
                    "recorded_at": as_datetime(row.recorded_at),
                    "type": row.type,
                    "tokens": int(row.tokens),
                    "price": float(
                        as_decimal(row.price if row.price is not None else 0)
                    ),
                },
            )
        counts["token_count"] = len(tokens)

    return counts


def migrate_sqlite_file_to_url(
    sqlite_path: Path,
    database_url: str,
) -> dict[str, int]:
    if not sqlite_path.is_file():
        raise FileNotFoundError(f"SQLite database not found: {sqlite_path}")

    source = create_engine(f"sqlite:///{sqlite_path}")
    target = create_engine(database_url)
    try:
        clear_user_data(target)
        return copy_user_data(source, target)
    finally:
        source.dispose()
        target.dispose()
