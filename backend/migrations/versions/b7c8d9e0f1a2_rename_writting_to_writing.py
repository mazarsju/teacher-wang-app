"""rename writting -> writing (typo fix)

Revision ID: b7c8d9e0f1a2
Revises: a2b3c4d5e6f7
Create Date: 2026-08-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PARTITION_MODULUS = 8


def upgrade() -> None:
    op.alter_column("character", "writting_known", new_column_name="writing_known")
    op.alter_column("words", "writting_known", new_column_name="writing_known")
    op.alter_column(
        "words", "anki_writting_sync", new_column_name="anki_writing_sync"
    )
    op.rename_table("ignore_writting_card", "ignore_writing_card")
    for remainder in range(PARTITION_MODULUS):
        op.rename_table(
            f"ignore_writting_card_p{remainder}",
            f"ignore_writing_card_p{remainder}",
        )


def downgrade() -> None:
    for remainder in range(PARTITION_MODULUS):
        op.rename_table(
            f"ignore_writing_card_p{remainder}",
            f"ignore_writting_card_p{remainder}",
        )
    op.rename_table("ignore_writing_card", "ignore_writting_card")
    op.alter_column(
        "words", "anki_writing_sync", new_column_name="anki_writting_sync"
    )
    op.alter_column("words", "writing_known", new_column_name="writting_known")
    op.alter_column("character", "writing_known", new_column_name="writting_known")
