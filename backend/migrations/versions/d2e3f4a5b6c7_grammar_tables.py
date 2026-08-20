"""grammar tables

Adds ``grammar_points`` (shared, like the hsk_* tables), ``grammar_prerequisites``
(a shared association table between grammar points), and ``user_grammar_progress``
(private, hash-partitioned on user_id like the other per-user tables).

Revision ID: d2e3f4a5b6c7
Revises: c5d6e7f8a9b0
Create Date: 2026-08-20 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, Sequence[str], None] = "c5d6e7f8a9b0"
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
        CREATE TABLE grammar_points (
            id VARCHAR(128) NOT NULL,
            hsk_level INTEGER NOT NULL,
            title TEXT NOT NULL,
            s3_key TEXT,
            PRIMARY KEY (id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE grammar_prerequisites (
            grammar_id VARCHAR(128) NOT NULL REFERENCES grammar_points (id),
            prerequisite_id VARCHAR(128) NOT NULL REFERENCES grammar_points (id),
            PRIMARY KEY (grammar_id, prerequisite_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE user_grammar_progress (
            user_id NUMERIC NOT NULL REFERENCES users (shortid),
            grammar_id VARCHAR(128) NOT NULL REFERENCES grammar_points (id),
            status TEXT NOT NULL DEFAULT 'TODO',
            score NUMERIC,
            last_practiced_at TIMESTAMPTZ,
            PRIMARY KEY (user_id, grammar_id)
        ) PARTITION BY HASH (user_id)
        """
    )
    _create_hash_partitions("user_grammar_progress")


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "user_grammar_progress" CASCADE')
    op.execute('DROP TABLE IF EXISTS "grammar_prerequisites" CASCADE')
    op.execute('DROP TABLE IF EXISTS "grammar_points" CASCADE')
