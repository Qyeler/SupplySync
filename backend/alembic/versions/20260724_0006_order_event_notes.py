"""Add notes to purchase order status events.

Revision ID: 20260724_0006
Revises: 20260724_0005
Create Date: 2026-07-24
"""

import sqlalchemy as sa
from alembic import op

revision = "20260724_0006"
down_revision = "20260724_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "order_status_events",
        sa.Column(
            "note",
            sa.Text(),
            server_default="",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("order_status_events", "note")
