"""Add purchase order status history.

Revision ID: 20260724_0005
Revises: 20260723_0004
Create Date: 2026-07-24
"""

import sqlalchemy as sa
from alembic import op

revision = "20260724_0005"
down_revision = "20260723_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "order_status_events",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            nullable=False,
        ),
        sa.Column("order_id", sa.BigInteger(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("from_status", sa.Text(), nullable=True),
        sa.Column("to_status", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "event_type in ('created', 'status_changed', 'received', 'snapshot')",
            name="order_status_events_type_check",
        ),
        sa.CheckConstraint(
            (
                "from_status is null or from_status in "
                "('draft', 'sent', 'confirmed', 'delivered', 'cancelled')"
            ),
            name="order_status_events_from_status_check",
        ),
        sa.CheckConstraint(
            (
                "to_status in "
                "('draft', 'sent', 'confirmed', 'delivered', 'cancelled')"
            ),
            name="order_status_events_to_status_check",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["purchase_orders.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "order_status_events_order_created_idx",
        "order_status_events",
        ["order_id", "created_at"],
    )
    op.execute(
        """
        INSERT INTO order_status_events (
            order_id,
            event_type,
            from_status,
            to_status,
            created_at
        )
        SELECT
            id,
            'snapshot',
            NULL,
            status,
            updated_at
        FROM purchase_orders
        """
    )


def downgrade() -> None:
    op.drop_index(
        "order_status_events_order_created_idx",
        table_name="order_status_events",
    )
    op.drop_table("order_status_events")
