"""hsk_words_translation table

Per-language translations of hsk_words.definition. Shared HSK content (no
user_id), list-partitioned on language since every read filters on exactly
one language and new languages are added one at a time (see roadmap item 11
in README.md). A DEFAULT partition catches any language without a dedicated
partition yet.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-08-31 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE hsk_words_translation (
            hsk_word_id VARCHAR(128) NOT NULL REFERENCES hsk_words (id),
            language VARCHAR(3) NOT NULL,
            translate VARCHAR(200) NOT NULL,
            PRIMARY KEY (hsk_word_id, language)
        ) PARTITION BY LIST (language)
        """
    )
    op.execute(
        "CREATE TABLE hsk_words_translation_en PARTITION OF "
        "hsk_words_translation FOR VALUES IN ('en')"
    )
    op.execute(
        "CREATE TABLE hsk_words_translation_default PARTITION OF "
        "hsk_words_translation DEFAULT"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS hsk_words_translation CASCADE")
