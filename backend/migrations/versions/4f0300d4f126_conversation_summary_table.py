"""conversation summary table

Stores a JSON summary of an AI agent conversation, keyed by the same
conversation identifier used for its S3 transcript. Hash-partitioned on
user_id like the other private tables.

Revision ID: 4f0300d4f126
Revises: e5f6a7b8c9d0
Create Date: 2026-08-12 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "4f0300d4f126"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
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
        CREATE TABLE conversation_summary (
            id BIGINT GENERATED ALWAYS AS IDENTITY,
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            conversation_id TEXT NOT NULL,
            summary JSONB NOT NULL,
            revision NUMERIC,
            latest BOOLEAN,
            PRIMARY KEY (user_id, id)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("conversation_summary")


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "conversation_summary" CASCADE')
