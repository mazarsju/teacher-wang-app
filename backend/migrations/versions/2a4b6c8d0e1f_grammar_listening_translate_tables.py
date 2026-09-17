"""grammar_points_translate and listening_practice_translate tables

Translated titles for grammar_points/listening_practice, populated by the
grammar/listening reload endpoints from the S3 content bucket's
grammar_<language>.yaml/overview_<language>.yaml siblings (see
grammar_content_loader.fetch_grammar_titles and
listening_content_loader.fetch_listening_practice_translations). Shared
content (no user_id), not partitioned — small tables, unlike
hsk_words_translation. ON DELETE CASCADE so the reload's clear-and-repopulate
of the parent table (GrammarPoint.query.delete() / ListeningPractice.query.delete())
also clears stale translations instead of failing on the FK.

Revision ID: 2a4b6c8d0e1f
Revises: 1c72f961e8ef
Create Date: 2026-09-17 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "2a4b6c8d0e1f"
down_revision: Union[str, Sequence[str], None] = "1c72f961e8ef"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE grammar_points_translate (
            id BIGINT GENERATED ALWAYS AS IDENTITY,
            language VARCHAR(3) NOT NULL,
            point_id VARCHAR(128) NOT NULL REFERENCES grammar_points (id) ON DELETE CASCADE,
            translate TEXT NOT NULL,
            PRIMARY KEY (id),
            UNIQUE (point_id, language)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE listening_practice_translate (
            id BIGINT GENERATED ALWAYS AS IDENTITY,
            language VARCHAR(3) NOT NULL,
            point_id VARCHAR(128) NOT NULL REFERENCES listening_practice (id) ON DELETE CASCADE,
            translate TEXT NOT NULL,
            PRIMARY KEY (id),
            UNIQUE (point_id, language)
        )
        """
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "listening_practice_translate" CASCADE')
    op.execute('DROP TABLE IF EXISTS "grammar_points_translate" CASCADE')
