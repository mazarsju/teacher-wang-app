"""add users.shortid

Unique numeric short identifier for each user, filled by a Postgres sequence
so inserts that omit ``shortid`` still get a stable auto-increment value.

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-08-04 13:15:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE users_shortid_seq")
    op.add_column(
        "users",
        sa.Column(
            "shortid",
            sa.Numeric(),
            nullable=False,
            server_default=sa.text("nextval('users_shortid_seq')"),
        ),
    )
    op.create_unique_constraint("uq_users_shortid", "users", ["shortid"])
    op.execute("ALTER SEQUENCE users_shortid_seq OWNED BY users.shortid")


def downgrade() -> None:
    op.drop_constraint("uq_users_shortid", "users", type_="unique")
    op.drop_column("users", "shortid")
    # OWNED BY drops the sequence with the column; keep a guard for partial runs.
    op.execute("DROP SEQUENCE IF EXISTS users_shortid_seq")
