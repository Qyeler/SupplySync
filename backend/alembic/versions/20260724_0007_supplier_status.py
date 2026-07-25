"""Add reversible supplier status.

Revision ID: 20260724_0007
Revises: 20260724_0006
Create Date: 2026-07-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260724_0007"
down_revision: str | None = "20260724_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "suppliers",
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.true(),
            nullable=False,
        ),
    )
    op.create_index(
        "suppliers_active_name_idx",
        "suppliers",
        ["name"],
        postgresql_where=sa.text("is_active"),
    )


def downgrade() -> None:
    op.drop_index("suppliers_active_name_idx", table_name="suppliers")
    op.drop_column("suppliers", "is_active")
