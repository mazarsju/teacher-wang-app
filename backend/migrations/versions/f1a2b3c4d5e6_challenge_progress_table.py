"""challenge progress table

Tracks whether a user has fully completed a challenge scenario. Hash-
partitioned on user_id like the other private tables.

Revision ID: f1a2b3c4d5e6
Revises: d5e6f7a8b9c0
Create Date: 2026-08-06 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
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
        CREATE TABLE challenge_progress (
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            challenge_scenario TEXT NOT NULL,
            completed BOOLEAN NOT NULL DEFAULT TRUE,
            PRIMARY KEY (user_id, challenge_scenario)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("challenge_progress")


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "challenge_progress" CASCADE')
