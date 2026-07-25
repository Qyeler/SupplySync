"""Add product catalog and supplier offers.

Revision ID: 20260723_0002
Revises: 20260723_0001
Create Date: 2026-07-23
"""

from alembic import op
import sqlalchemy as sa

revision = "20260723_0002"
down_revision = "20260723_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("sku", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("unit", sa.Text(), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku", name="products_sku_key"),
    )
    op.create_index(
        "products_active_category_name_idx",
        "products",
        ["category", "name"],
        postgresql_where=sa.text("is_active"),
    )

    op.create_table(
        "supplier_products",
        sa.Column("supplier_id", sa.BigInteger(), nullable=False),
        sa.Column("product_id", sa.BigInteger(), nullable=False),
        sa.Column("supplier_sku", sa.Text(), server_default="", nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "minimum_order",
            sa.Numeric(12, 3),
            server_default="1",
            nullable=False,
        ),
        sa.Column(
            "is_preferred",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "unit_price >= 0",
            name="supplier_products_unit_price_check",
        ),
        sa.CheckConstraint(
            "minimum_order > 0",
            name="supplier_products_minimum_order_check",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="supplier_products_product_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["suppliers.id"],
            name="supplier_products_supplier_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("supplier_id", "product_id"),
    )
    op.create_index(
        "supplier_products_product_id_idx",
        "supplier_products",
        ["product_id"],
    )

    op.add_column(
        "order_items",
        sa.Column("product_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "order_items_product_id_fkey",
        "order_items",
        "products",
        ["product_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("order_items_product_id_idx", "order_items", ["product_id"])


def downgrade() -> None:
    op.drop_index("order_items_product_id_idx", table_name="order_items")
    op.drop_constraint(
        "order_items_product_id_fkey",
        "order_items",
        type_="foreignkey",
    )
    op.drop_column("order_items", "product_id")
    op.drop_index(
        "supplier_products_product_id_idx",
        table_name="supplier_products",
    )
    op.drop_table("supplier_products")
    op.drop_index("products_active_category_name_idx", table_name="products")
    op.drop_table("products")

