"""rename words.synchronized to anki_voc_sync, add anki_writting_sync

Revision ID: a2b3c4d5e6f7
Revises: f4a5b6c7d8e9
Create Date: 2026-08-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("words", "synchronized", new_column_name="anki_voc_sync")
    op.add_column(
        "words",
        sa.Column(
            "anki_writting_sync",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("words", "anki_writting_sync")
    op.alter_column("words", "anki_voc_sync", new_column_name="synchronized")
