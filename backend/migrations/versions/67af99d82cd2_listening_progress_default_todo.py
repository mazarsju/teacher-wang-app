"""listening_progress status default TODO

A listening topic the user has never opened defaults to TODO everywhere
else in the app (see writing_progress/user_grammar_progress); the initial
migration mistakenly copied writing_progress's WIP default. Fixed here
rather than editing that migration, since it's already applied.

Revision ID: 67af99d82cd2
Revises: 3c36661c5faa
Create Date: 2026-09-11 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "67af99d82cd2"
down_revision: Union[str, Sequence[str], None] = "3c36661c5faa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE listening_progress ALTER COLUMN status SET DEFAULT 'TODO'")


def downgrade() -> None:
    op.execute("ALTER TABLE listening_progress ALTER COLUMN status SET DEFAULT 'WIP'")
