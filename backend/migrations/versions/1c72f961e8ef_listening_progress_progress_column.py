"""add listening_progress.progress

Revision ID: 1c72f961e8ef
Revises: fcfc288c1b3a
Create Date: 2026-09-14 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "1c72f961e8ef"
down_revision: Union[str, Sequence[str], None] = "fcfc288c1b3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE listening_progress ADD COLUMN progress VARCHAR")


def downgrade() -> None:
    op.execute("ALTER TABLE listening_progress DROP COLUMN progress")
