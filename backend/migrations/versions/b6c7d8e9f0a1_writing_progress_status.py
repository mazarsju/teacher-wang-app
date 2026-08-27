"""writing progress status

Replaces ``writing_progress.score`` with a ``status`` column (WIP/DONE) and
FKs ``writing_topic`` to ``writing_practice.id``. No production data exists
for this table yet, so the partitioned table is dropped and recreated
rather than altered in place.

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-08-27 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, Sequence[str], None] = "a5b6c7d8e9f0"
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
    op.execute('DROP TABLE IF EXISTS "writing_progress" CASCADE')
    op.execute(
        """
        CREATE TABLE writing_progress (
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            writing_topic VARCHAR(128) NOT NULL REFERENCES writing_practice (id),
            status TEXT NOT NULL DEFAULT 'WIP',
            PRIMARY KEY (user_id, writing_topic)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("writing_progress")


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "writing_progress" CASCADE')
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
