"""character.pinyin becomes an array

Storage-only change: the column becomes a Postgres array of readings, but
every row still holds exactly one (wrapped in a single-element array). The
ORM's `Character.pinyin` hybrid property keeps exposing it as a plain string,
so no other code needs to change.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-08-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE character ALTER COLUMN pinyin TYPE varchar(8)[] "
        "USING ARRAY[pinyin]"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE character ALTER COLUMN pinyin TYPE varchar(8) "
        "USING pinyin[1]"
    )
