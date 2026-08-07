"""add hsk_characters.most_used_pinyin

Revision ID: d1e2f3a4b5c6
Revises: c9d0e1f2a3b4
Create Date: 2026-08-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "hsk_characters",
        sa.Column(
            "most_used_pinyin",
            sa.String(length=8),
            nullable=False,
            server_default="",
        ),
    )


def downgrade() -> None:
    op.drop_column("hsk_characters", "most_used_pinyin")
