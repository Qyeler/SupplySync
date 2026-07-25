"""Cascade receipt lines with order items.

Revision ID: 20260723_0004
Revises: 20260723_0003
Create Date: 2026-07-23
"""

from alembic import op

revision = "20260723_0004"
down_revision = "20260723_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "receipt_items_order_item_id_fkey",
        "receipt_items",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "receipt_items_order_item_id_fkey",
        "receipt_items",
        "order_items",
        ["order_item_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "receipt_items_order_item_id_fkey",
        "receipt_items",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "receipt_items_order_item_id_fkey",
        "receipt_items",
        "order_items",
        ["order_item_id"],
        ["id"],
        ondelete="RESTRICT",
    )
