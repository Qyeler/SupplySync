"""Add purchase order receipts.

Revision ID: 20260723_0003
Revises: 20260723_0002
Create Date: 2026-07-23
"""

from alembic import op
import sqlalchemy as sa

revision = "20260723_0003"
down_revision = "20260723_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "receipts",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("order_id", sa.BigInteger(), nullable=False),
        sa.Column("received_by", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["purchase_orders.id"],
            name="receipts_order_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", name="receipts_order_id_key"),
    )

    op.create_table(
        "receipt_items",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("receipt_id", sa.BigInteger(), nullable=False),
        sa.Column("order_item_id", sa.BigInteger(), nullable=False),
        sa.Column("received_quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column(
            "rejected_quantity",
            sa.Numeric(12, 3),
            server_default="0",
            nullable=False,
        ),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.CheckConstraint(
            "received_quantity >= 0",
            name="receipt_items_received_quantity_check",
        ),
        sa.CheckConstraint(
            "rejected_quantity >= 0",
            name="receipt_items_rejected_quantity_check",
        ),
        sa.CheckConstraint(
            "rejected_quantity <= received_quantity",
            name="receipt_items_rejected_not_above_received_check",
        ),
        sa.ForeignKeyConstraint(
            ["order_item_id"],
            ["order_items.id"],
            name="receipt_items_order_item_id_fkey",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["receipt_id"],
            ["receipts.id"],
            name="receipt_items_receipt_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "order_item_id",
            name="receipt_items_order_item_id_key",
        ),
    )
    op.create_index(
        "receipt_items_receipt_id_idx",
        "receipt_items",
        ["receipt_id"],
    )


def downgrade() -> None:
    op.drop_index("receipt_items_receipt_id_idx", table_name="receipt_items")
    op.drop_table("receipt_items")
    op.drop_table("receipts")
