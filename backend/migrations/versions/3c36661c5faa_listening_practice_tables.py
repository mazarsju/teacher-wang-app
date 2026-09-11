"""listening practice tables

Adds listening_practice (shared curriculum catalog, like writing_practice)
and listening_progress (private, hash-partitioned on user_id, like
conversation_summary).

Revision ID: 3c36661c5faa
Revises: d3e4f5a6b7c8
Create Date: 2026-09-11 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "3c36661c5faa"
down_revision: Union[str, Sequence[str], None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Keep in sync with backend.utils.database.models.USER_PARTITION_MODULUS.
PARTITION_MODULUS = 8


def _create_hash_partitions(table: str) -> None:
    for remainder in range(PARTITION_MODULUS):
        op.execute(
            f'CREATE TABLE "{table}_p{remainder}" PARTITION OF "{table}" '
            f"FOR VALUES WITH (MODULUS {PARTITION_MODULUS}, "
            f"REMAINDER {remainder})"
        )


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE listening_practice (
            id VARCHAR(128) NOT NULL,
            title TEXT NOT NULL,
            hsk_level INTEGER NOT NULL,
            grammar_rules TEXT NOT NULL DEFAULT '',
            unique_chars TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE listening_progress (
            id BIGINT GENERATED ALWAYS AS IDENTITY,
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            listening_topic VARCHAR(128) NOT NULL REFERENCES listening_practice (id),
            vocabulary_score INTEGER NOT NULL DEFAULT 0,
            grammar_score INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'WIP',
            PRIMARY KEY (user_id, id)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("listening_progress")


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "listening_progress" CASCADE')
    op.execute('DROP TABLE IF EXISTS "listening_practice" CASCADE')
