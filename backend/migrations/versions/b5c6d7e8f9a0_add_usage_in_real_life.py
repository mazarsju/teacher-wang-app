"""add usage_in_real_life to user_grammar_progress

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-08-25 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, Sequence[str], None] = "a4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE user_grammar_progress ADD COLUMN usage_in_real_life NUMERIC"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE user_grammar_progress DROP COLUMN usage_in_real_life"
    )
