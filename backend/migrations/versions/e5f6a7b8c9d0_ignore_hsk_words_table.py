"""ignore hsk words table

Tracks HSK words a user chose to ignore from the "words to learn next"
suggestions, so they are filtered out of future suggestions. Hash-
partitioned on user_id like the other private tables.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-09 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Keep in sync with backend.models.USER_PARTITION_MODULUS.
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
        CREATE TABLE ignore_hsk_words (
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            writing TEXT NOT NULL,
            PRIMARY KEY (user_id, writing)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("ignore_hsk_words")


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "ignore_hsk_words" CASCADE')
