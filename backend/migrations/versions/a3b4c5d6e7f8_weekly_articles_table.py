"""weekly articles table

Shared table (no user_id) storing the LLM-picked "most important"
China-news article for a given week/year/HSK level.

Revision ID: a3b4c5d6e7f8
Revises: 4f0300d4f126
Create Date: 2026-08-14 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "4f0300d4f126"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "weekly_articles",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("hsk_level", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "week", "year", "hsk_level", name="uq_weekly_articles_week_year_hsk_level"
        ),
    )


def downgrade() -> None:
    op.drop_table("weekly_articles")
