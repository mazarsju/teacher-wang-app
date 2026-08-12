"""user scoped private tables

Adds the ``users`` table and recreates every private table with a ``user_id``
first primary-key column, hash-partitioned on ``user_id``. HSK tables stay
shared. Private data is dropped: characters/words are re-imported per user.

Revision ID: 9c4b71e0a2d5
Revises: 376edc4d57aa
Create Date: 2026-07-31 10:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c4b71e0a2d5'
down_revision: Union[str, Sequence[str], None] = '376edc4d57aa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Hash partitions per private table. Keep in sync with
# backend.utils.database.models.USER_PARTITION_MODULUS.
PARTITION_MODULUS = 8

# Dropped children first: character_word references character and words.
PRIVATE_TABLES = (
    "character_word",
    "character",
    "words",
    "settings",
    "ignore_vocab_card",
    "ignore_writting_card",
    "token_count",
)

PARTITIONED_TABLES = (
    "character",
    "words",
    "character_word",
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


def upgrade() -> None:
    for table in PRIVATE_TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

    op.create_table(
        "users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("plan", sa.String(), nullable=False),
        sa.Column("last_connexion", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
    )

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
    op.execute(
        """
        CREATE TABLE ignore_vocab_card (
            user_id TEXT NOT NULL REFERENCES users (id),
            writting TEXT NOT NULL,
            PRIMARY KEY (user_id, writting)
        ) PARTITION BY HASH (user_id)
        """
    )
    op.execute(
        """
        CREATE TABLE ignore_writting_card (
            user_id TEXT NOT NULL REFERENCES users (id),
            recto TEXT NOT NULL,
            PRIMARY KEY (user_id, recto)
        ) PARTITION BY HASH (user_id)
        """
    )
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

    for table in PARTITIONED_TABLES:
        _create_hash_partitions(table)


def downgrade() -> None:
    for table in PRIVATE_TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")

    op.create_table(
        "character",
        sa.Column("char", sa.String(), nullable=False),
        sa.Column("pinyin", sa.String(length=8), nullable=False),
        sa.Column("writting_known", sa.Boolean(), nullable=False),
        sa.Column("synchronized", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("char"),
    )
    op.create_table(
        "words",
        sa.Column("word", sa.String(length=10), nullable=False),
        sa.Column("definition", sa.String(length=100), nullable=True),
        sa.Column("synchronized", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("word"),
    )
    op.create_table(
        "character_word",
        sa.Column("character_char", sa.String(), nullable=False),
        sa.Column("word", sa.String(length=10), nullable=False),
        sa.ForeignKeyConstraint(["character_char"], ["character.char"]),
        sa.ForeignKeyConstraint(["word"], ["words.word"]),
        sa.PrimaryKeyConstraint("character_char", "word"),
    )
    op.create_table(
        "settings",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_table(
        "ignore_vocab_card",
        sa.Column("writting", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("writting"),
    )
    op.create_table(
        "ignore_writting_card",
        sa.Column("recto", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("recto"),
    )
    op.create_table(
        "token_count",
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("tokens", sa.Integer(), nullable=False),
        sa.Column("price", sa.Numeric(precision=20, scale=5), nullable=False),
        sa.PrimaryKeyConstraint("recorded_at", "type"),
    )
