"""hsk_words id pinyin definition

Replace word-as-PK with id (word|pinyin), and add pinyin + definition
columns so each complete-hsk form becomes its own row. Rebuild the
hsk_word_character link table to reference hsk_words.id.

Shared HSK data is reloaded on boot when empty, so existing rows are dropped.

Revision ID: a1b2c3d4e5f6
Revises: 9c4b71e0a2d5
Create Date: 2026-08-03 13:50:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "9c4b71e0a2d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("hsk_word_character")
    op.drop_table("hsk_words")

    op.create_table(
        "hsk_words",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("word", sa.String(length=32), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("frequency", sa.Integer(), nullable=False),
        sa.Column("pinyin", sa.String(length=64), nullable=False),
        sa.Column("definition", sa.String(length=512), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hsk_words_word", "hsk_words", ["word"], unique=False)

    op.create_table(
        "hsk_word_character",
        sa.Column("word_id", sa.String(length=128), nullable=False),
        sa.Column("character", sa.String(length=1), nullable=False),
        sa.ForeignKeyConstraint(["character"], ["hsk_characters.character"]),
        sa.ForeignKeyConstraint(["word_id"], ["hsk_words.id"]),
        sa.PrimaryKeyConstraint("word_id", "character"),
    )


def downgrade() -> None:
    op.drop_table("hsk_word_character")
    op.drop_index("ix_hsk_words_word", table_name="hsk_words")
    op.drop_table("hsk_words")

    op.create_table(
        "hsk_words",
        sa.Column("word", sa.String(length=32), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("frequency", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("word"),
    )
    op.create_table(
        "hsk_word_character",
        sa.Column("word", sa.String(length=32), nullable=False),
        sa.Column("character", sa.String(length=1), nullable=False),
        sa.ForeignKeyConstraint(["character"], ["hsk_characters.character"]),
        sa.ForeignKeyConstraint(["word"], ["hsk_words.word"]),
        sa.PrimaryKeyConstraint("word", "character"),
    )
