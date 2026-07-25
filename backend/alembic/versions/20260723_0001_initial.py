"""Create suppliers, purchase orders, and order items.

Revision ID: 20260723_0001
Revises:
Create Date: 2026-07-23
"""

from alembic import op
import sqlalchemy as sa

revision = "20260723_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "suppliers",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("contact_name", sa.Text(), nullable=False),
        sa.Column("phone", sa.Text(), nullable=False),
        sa.Column("lead_time_days", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "lead_time_days between 0 and 365",
            name="suppliers_lead_time_days_check",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="suppliers_name_key"),
    )

    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("number", sa.Text(), nullable=False),
        sa.Column("supplier_id", sa.BigInteger(), nullable=False),
        sa.Column("delivery_date", sa.Date(), nullable=False),
        sa.Column("status", sa.Text(), server_default="draft", nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status in ('draft', 'sent', 'confirmed', 'delivered', 'cancelled')",
            name="purchase_orders_status_check",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["suppliers.id"],
            name="purchase_orders_supplier_id_fkey",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("number", name="purchase_orders_number_key"),
    )
    op.create_index(
        "purchase_orders_supplier_id_idx",
        "purchase_orders",
        ["supplier_id"],
    )
    op.create_index(
        "purchase_orders_status_delivery_date_idx",
        "purchase_orders",
        ["status", "delivery_date"],
    )

    op.create_table(
        "order_items",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("order_id", sa.BigInteger(), nullable=False),
        sa.Column("product_name", sa.Text(), nullable=False),
        sa.Column("unit", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.CheckConstraint("quantity > 0", name="order_items_quantity_check"),
        sa.CheckConstraint("unit_price >= 0", name="order_items_unit_price_check"),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["purchase_orders.id"],
            name="order_items_order_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("order_items_order_id_idx", "order_items", ["order_id"])


def downgrade() -> None:
    op.drop_index("order_items_order_id_idx", table_name="order_items")
    op.drop_table("order_items")
    op.drop_index(
        "purchase_orders_status_delivery_date_idx",
        table_name="purchase_orders",
    )
    op.drop_index("purchase_orders_supplier_id_idx", table_name="purchase_orders")
    op.drop_table("purchase_orders")
    op.drop_table("suppliers")

