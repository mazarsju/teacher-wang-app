"""writing practice table

Adds ``writing_practice`` (shared, like ``grammar_points`` — no user_id, no
partitioning): the curriculum catalog of writing-practice topics, each
anchored to the grammar point it follows. Populated from S3
(``writing_practice/<name>/overview.yaml``) by the same
``POST /admin/grammar/reload`` endpoint that reloads ``grammar_points``.

Revision ID: a5b6c7d8e9f0
Revises: c1d2e3f4a5b6
Create Date: 2026-08-27 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "a5b6c7d8e9f0"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE writing_practice (
            id VARCHAR(128) NOT NULL,
            title TEXT NOT NULL,
            after_grammar_point VARCHAR(128) NOT NULL REFERENCES grammar_points (id),
            PRIMARY KEY (id)
        )
        """
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "writing_practice" CASCADE')
