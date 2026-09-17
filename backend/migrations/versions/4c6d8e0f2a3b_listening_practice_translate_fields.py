"""listening_practice_translate type/topic columns

GET /listening-practices-light used to translate title/type/topic with a
live per-request S3 read (fetch_listening_practice_translations); it now
reads listening_practice_translate instead, so that table needs to cache
all three fields, not just the title. translate (title) becomes nullable
too, since a manifest may translate only some of the three fields — same
per-field fallback contract the old S3 read had.

Revision ID: 4c6d8e0f2a3b
Revises: 3b5c7d9e1f2a
Create Date: 2026-09-17 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "4c6d8e0f2a3b"
down_revision: Union[str, Sequence[str], None] = "3b5c7d9e1f2a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE "listening_practice_translate" ALTER COLUMN "translate" DROP NOT NULL'
    )
    op.execute('ALTER TABLE "listening_practice_translate" ADD COLUMN "type" TEXT')
    op.execute('ALTER TABLE "listening_practice_translate" ADD COLUMN "topic" TEXT')


def downgrade() -> None:
    op.execute('ALTER TABLE "listening_practice_translate" DROP COLUMN "topic"')
    op.execute('ALTER TABLE "listening_practice_translate" DROP COLUMN "type"')
    op.execute(
        'UPDATE "listening_practice_translate" SET "translate" = \'\' WHERE "translate" IS NULL'
    )
    op.execute(
        'ALTER TABLE "listening_practice_translate" ALTER COLUMN "translate" SET NOT NULL'
    )
