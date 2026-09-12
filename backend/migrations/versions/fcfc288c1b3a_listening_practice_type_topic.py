"""listening_practice type/topic columns

overview.yaml already carries `type` and `topic` for every listening
topic; this stores them so the list API can return them for the frontend
badges instead of dropping them on load.

Revision ID: fcfc288c1b3a
Revises: 67af99d82cd2
Create Date: 2026-09-12 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "fcfc288c1b3a"
down_revision: Union[str, Sequence[str], None] = "67af99d82cd2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE listening_practice "
        "ADD COLUMN type TEXT NOT NULL DEFAULT '', "
        "ADD COLUMN topic TEXT NOT NULL DEFAULT ''"
    )
    op.execute("ALTER TABLE listening_practice ALTER COLUMN type DROP DEFAULT")
    op.execute("ALTER TABLE listening_practice ALTER COLUMN topic DROP DEFAULT")


def downgrade() -> None:
    op.execute("ALTER TABLE listening_practice DROP COLUMN topic")
    op.execute("ALTER TABLE listening_practice DROP COLUMN type")
