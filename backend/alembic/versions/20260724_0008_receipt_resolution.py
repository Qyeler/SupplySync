"""Add discrepancy resolution workflow.

Revision ID: 20260724_0008
Revises: 20260724_0007
Create Date: 2026-07-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260724_0008"
down_revision: str | None = "20260724_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "receipts",
        sa.Column(
            "is_resolved",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column(
        "receipts",
        sa.Column(
            "resolution_note",
            sa.Text(),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "receipts",
        sa.Column(
            "resolved_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.drop_constraint(
        "order_status_events_type_check",
        "order_status_events",
        type_="check",
    )
    op.create_check_constraint(
        "order_status_events_type_check",
        "order_status_events",
        (
            "event_type in ('created', 'status_changed', 'received', "
            "'snapshot', 'discrepancy_resolved', 'discrepancy_reopened')"
        ),
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM order_status_events
        WHERE event_type IN ('discrepancy_resolved', 'discrepancy_reopened')
        """
    )
    op.drop_constraint(
        "order_status_events_type_check",
        "order_status_events",
        type_="check",
    )
    op.create_check_constraint(
        "order_status_events_type_check",
        "order_status_events",
        "event_type in ('created', 'status_changed', 'received', 'snapshot')",
    )
    op.drop_column("receipts", "resolved_at")
    op.drop_column("receipts", "resolution_note")
    op.drop_column("receipts", "is_resolved")
