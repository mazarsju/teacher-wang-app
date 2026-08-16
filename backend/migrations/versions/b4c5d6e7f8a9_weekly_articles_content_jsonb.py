"""weekly_articles.content as jsonb

Store each week/HSK-level row as a JSON list of per-article objects
(title, content, optional translation/pinyin) instead of one plain-text
blob. Existing rows are regenerable via POST /admin/articles/generate, so
the old text content is simply dropped rather than migrated in place.

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-08-15 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("weekly_articles", "content")
    op.add_column(
        "weekly_articles",
        sa.Column(
            "content",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.alter_column("weekly_articles", "content", server_default=None)


def downgrade() -> None:
    op.drop_column("weekly_articles", "content")
    op.add_column(
        "weekly_articles",
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
    )
    op.alter_column("weekly_articles", "content", server_default=None)
