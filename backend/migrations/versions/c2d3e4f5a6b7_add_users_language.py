"""add users.language

Revision ID: c2d3e4f5a6b7
Revises: b6c7d8e9f0a1
Create Date: 2026-08-28 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "b6c7d8e9f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("language", sa.String(), nullable=False, server_default="en"),
    )


def downgrade() -> None:
    op.drop_column("users", "language")
