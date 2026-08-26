"""writing progress table

Tracks a user's score on a writing topic. Hash-partitioned on user_id like
the other private tables, mirroring challenge_progress but with a score
column instead of a completed boolean.

Revision ID: c1d2e3f4a5b6
Revises: b5c6d7e8f9a0
Create Date: 2026-08-26 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "b5c6d7e8f9a0"
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
        CREATE TABLE writing_progress (
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            writing_topic TEXT NOT NULL,
            score NUMERIC,
            PRIMARY KEY (user_id, writing_topic)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("writing_progress")


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "writing_progress" CASCADE')
