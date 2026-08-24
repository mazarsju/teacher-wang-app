"""add grammar_points new_words

Revision ID: a4b5c6d7e8f9
Revises: d2e3f4a5b6c7
Create Date: 2026-08-24 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, Sequence[str], None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE grammar_points ADD COLUMN new_words JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE grammar_points DROP COLUMN new_words")
