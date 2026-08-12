"""private tables FK users.shortid; drop character_word

Recreate hash-partitioned private tables so ``user_id`` references
``users.shortid`` (NUMERIC) instead of ``users.id`` (Cognito sub TEXT).
Drops the unused ``character_word`` association table.

Existing rows are remapped via ``users.shortid``; partition membership
changes because the hash key type and values change.

Revision ID: d5e6f7a8b9c0
Revises: c3d4e5f6a7b8
Create Date: 2026-08-04 17:40:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Keep in sync with backend.utils.database.models.USER_PARTITION_MODULUS.
PARTITION_MODULUS = 8

# Recreated (and remapped) private tables — character_word is dropped for good.
REMAPPED_TABLES = (
    "character",
    "words",
    "settings",
    "ignore_vocab_card",
    "ignore_writting_card",
    "token_count",
)


def _create_hash_partitions(table: str) -> None:
    for remainder in range(PARTITION_MODULUS):
        op.execute(
            f'CREATE TABLE "{table}_p{remainder}" PARTITION OF "{table}" '
            f"FOR VALUES WITH (MODULUS {PARTITION_MODULUS}, "
            f"REMAINDER {remainder})"
        )


def _rename_new_partitions(table: str) -> None:
    for remainder in range(PARTITION_MODULUS):
        op.execute(
            f'ALTER TABLE "{table}_new_p{remainder}" '
            f'RENAME TO "{table}_p{remainder}"'
        )


def _create_shortid_table(create_sql: str, table: str) -> None:
    op.execute(create_sql)
    _create_hash_partitions(f"{table}_new")


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS character_word CASCADE")

    _create_shortid_table(
        """
        CREATE TABLE character_new (
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            char TEXT NOT NULL,
            pinyin VARCHAR(8) NOT NULL,
            writting_known BOOLEAN NOT NULL,
            synchronized BOOLEAN NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (user_id, char)
        ) PARTITION BY HASH (user_id)
        """,
        "character",
    )
    op.execute(
        """
        INSERT INTO character_new (
            user_id, char, pinyin, writting_known, synchronized, updated_at
        )
        SELECT u.shortid, c.char, c.pinyin, c.writting_known,
               c.synchronized, c.updated_at
        FROM "character" c
        JOIN users u ON u.id = c.user_id
        """
    )
    op.execute('DROP TABLE "character" CASCADE')
    op.execute("ALTER TABLE character_new RENAME TO character")
    _rename_new_partitions("character")

    _create_shortid_table(
        """
        CREATE TABLE words_new (
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            word VARCHAR(10) NOT NULL,
            definition VARCHAR(100),
            synchronized BOOLEAN NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (user_id, word)
        ) PARTITION BY HASH (user_id)
        """,
        "words",
    )
    op.execute(
        """
        INSERT INTO words_new (
            user_id, word, definition, synchronized, updated_at
        )
        SELECT u.shortid, w.word, w.definition, w.synchronized, w.updated_at
        FROM words w
        JOIN users u ON u.id = w.user_id
        """
    )
    op.execute("DROP TABLE words CASCADE")
    op.execute("ALTER TABLE words_new RENAME TO words")
    _rename_new_partitions("words")

    _create_shortid_table(
        """
        CREATE TABLE settings_new (
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            key VARCHAR(64) NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (user_id, key)
        ) PARTITION BY HASH (user_id)
        """,
        "settings",
    )
    op.execute(
        """
        INSERT INTO settings_new (user_id, key, value)
        SELECT u.shortid, s.key, s.value
        FROM settings s
        JOIN users u ON u.id = s.user_id
        """
    )
    op.execute("DROP TABLE settings CASCADE")
    op.execute("ALTER TABLE settings_new RENAME TO settings")
    _rename_new_partitions("settings")

    _create_shortid_table(
        """
        CREATE TABLE ignore_vocab_card_new (
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            writting TEXT NOT NULL,
            PRIMARY KEY (user_id, writting)
        ) PARTITION BY HASH (user_id)
        """,
        "ignore_vocab_card",
    )
    op.execute(
        """
        INSERT INTO ignore_vocab_card_new (user_id, writting)
        SELECT u.shortid, i.writting
        FROM ignore_vocab_card i
        JOIN users u ON u.id = i.user_id
        """
    )
    op.execute("DROP TABLE ignore_vocab_card CASCADE")
    op.execute("ALTER TABLE ignore_vocab_card_new RENAME TO ignore_vocab_card")
    _rename_new_partitions("ignore_vocab_card")

    _create_shortid_table(
        """
        CREATE TABLE ignore_writting_card_new (
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            recto TEXT NOT NULL,
            PRIMARY KEY (user_id, recto)
        ) PARTITION BY HASH (user_id)
        """,
        "ignore_writting_card",
    )
    op.execute(
        """
        INSERT INTO ignore_writting_card_new (user_id, recto)
        SELECT u.shortid, i.recto
        FROM ignore_writting_card i
        JOIN users u ON u.id = i.user_id
        """
    )
    op.execute("DROP TABLE ignore_writting_card CASCADE")
    op.execute(
        "ALTER TABLE ignore_writting_card_new RENAME TO ignore_writting_card"
    )
    _rename_new_partitions("ignore_writting_card")

    _create_shortid_table(
        """
        CREATE TABLE token_count_new (
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            recorded_at TIMESTAMPTZ NOT NULL,
            type VARCHAR(16) NOT NULL,
            tokens INTEGER NOT NULL,
            price NUMERIC(20, 5) NOT NULL,
            PRIMARY KEY (user_id, recorded_at, type)
        ) PARTITION BY HASH (user_id)
        """,
        "token_count",
    )
    op.execute(
        """
        INSERT INTO token_count_new (
            user_id, recorded_at, type, tokens, price
        )
        SELECT u.shortid, t.recorded_at, t.type, t.tokens, t.price
        FROM token_count t
        JOIN users u ON u.id = t.user_id
        """
    )
    op.execute("DROP TABLE token_count CASCADE")
    op.execute("ALTER TABLE token_count_new RENAME TO token_count")
    _rename_new_partitions("token_count")


def downgrade() -> None:
    # Recreate TEXT / users.id shape and restore character_word. Remapped
    # shortid rows are not restored; association rows stay empty.
    for table in REMAPPED_TABLES:
        op.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')

    op.execute(
        """
        CREATE TABLE character (
            user_id TEXT NOT NULL REFERENCES users (id),
            char TEXT NOT NULL,
            pinyin VARCHAR(8) NOT NULL,
            writting_known BOOLEAN NOT NULL,
            synchronized BOOLEAN NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (user_id, char)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("character")

    op.execute(
        """
        CREATE TABLE words (
            user_id TEXT NOT NULL REFERENCES users (id),
            word VARCHAR(10) NOT NULL,
            definition VARCHAR(100),
            synchronized BOOLEAN NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (user_id, word)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("words")

    op.execute(
        """
        CREATE TABLE character_word (
            user_id TEXT NOT NULL REFERENCES users (id),
            character_char TEXT NOT NULL,
            word VARCHAR(10) NOT NULL,
            PRIMARY KEY (user_id, character_char, word),
            FOREIGN KEY (user_id, character_char)
                REFERENCES "character" (user_id, char),
            FOREIGN KEY (user_id, word) REFERENCES words (user_id, word)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("character_word")

    op.execute(
        """
        CREATE TABLE settings (
            user_id TEXT NOT NULL REFERENCES users (id),
            key VARCHAR(64) NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (user_id, key)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("settings")

    op.execute(
        """
        CREATE TABLE ignore_vocab_card (
            user_id TEXT NOT NULL REFERENCES users (id),
            writting TEXT NOT NULL,
            PRIMARY KEY (user_id, writting)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("ignore_vocab_card")

    op.execute(
        """
        CREATE TABLE ignore_writting_card (
            user_id TEXT NOT NULL REFERENCES users (id),
            recto TEXT NOT NULL,
            PRIMARY KEY (user_id, recto)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("ignore_writting_card")

    op.execute(
        """
        CREATE TABLE token_count (
            user_id TEXT NOT NULL REFERENCES users (id),
            recorded_at TIMESTAMPTZ NOT NULL,
            type VARCHAR(16) NOT NULL,
            tokens INTEGER NOT NULL,
            price NUMERIC(20, 5) NOT NULL,
            PRIMARY KEY (user_id, recorded_at, type)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("token_count")
