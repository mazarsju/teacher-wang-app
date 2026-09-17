"""grammar_points.index column

Stores curriculum_index(s3_key) (the rule folder's numeric prefix, e.g.
"hsk1/01-foo" -> 1) so list_grammar_points_light.py can read the sort/display
order straight off the row instead of recomputing it from s3_key on every
request. Populated by POST /admin/grammar/reload
(grammar_content_loader.reload_grammar_content), same as every other
grammar_points column.

Revision ID: 3b5c7d9e1f2a
Revises: 2a4b6c8d0e1f
Create Date: 2026-09-17 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "3b5c7d9e1f2a"
down_revision: Union[str, Sequence[str], None] = "2a4b6c8d0e1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE "grammar_points" ADD COLUMN "index" INTEGER NOT NULL DEFAULT 0'
    )


def downgrade() -> None:
    op.execute('ALTER TABLE "grammar_points" DROP COLUMN "index"')
