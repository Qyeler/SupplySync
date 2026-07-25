from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OrderStatus(StrEnum):
    DRAFT = "draft"
    SENT = "sent"
    CONFIRMED = "confirmed"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class OrderEventType(StrEnum):
    CREATED = "created"
    STATUS_CHANGED = "status_changed"
    RECEIVED = "received"
    SNAPSHOT = "snapshot"
    DISCREPANCY_RESOLVED = "discrepancy_resolved"
    DISCREPANCY_REOPENED = "discrepancy_reopened"


class Supplier(Base):
    __tablename__ = "suppliers"
    __table_args__ = (
        CheckConstraint(
            "lead_time_days between 0 and 365",
            name="suppliers_lead_time_days_check",
        ),
        UniqueConstraint("name", name="suppliers_name_key"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )
    name: Mapped[str] = mapped_column(Text)
    contact_name: Mapped[str] = mapped_column(Text)
    phone: Mapped[str] = mapped_column(Text)
    lead_time_days: Mapped[int] = mapped_column(SmallInteger)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default="true",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    orders: Mapped[list["PurchaseOrder"]] = relationship(back_populates="supplier")
    product_offers: Mapped[list["SupplierProduct"]] = relationship(
        back_populates="supplier",
        cascade="all, delete-orphan",
    )


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("sku", name="products_sku_key"),
        Index(
            "products_active_category_name_idx",
            "category",
            "name",
            postgresql_where=text("is_active"),
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )
    sku: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    unit: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default="true",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    offers: Mapped[list["SupplierProduct"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="SupplierProduct.unit_price",
    )
    order_items: Mapped[list["OrderItem"]] = relationship(back_populates="product")


class SupplierProduct(Base):
    __tablename__ = "supplier_products"
    __table_args__ = (
        CheckConstraint(
            "unit_price >= 0",
            name="supplier_products_unit_price_check",
        ),
        CheckConstraint(
            "minimum_order > 0",
            name="supplier_products_minimum_order_check",
        ),
        Index("supplier_products_product_id_idx", "product_id"),
    )

    supplier_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("suppliers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    product_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    )
    supplier_sku: Mapped[str] = mapped_column(Text, default="", server_default="")
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    minimum_order: Mapped[Decimal] = mapped_column(
        Numeric(12, 3),
        default=Decimal("1"),
        server_default="1",
    )
    is_preferred: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    supplier: Mapped[Supplier] = relationship(back_populates="product_offers")
    product: Mapped[Product] = relationship(back_populates="offers")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    __table_args__ = (
        CheckConstraint(
            "status in ('draft', 'sent', 'confirmed', 'delivered', 'cancelled')",
            name="purchase_orders_status_check",
        ),
        UniqueConstraint("number", name="purchase_orders_number_key"),
        Index("purchase_orders_supplier_id_idx", "supplier_id"),
        Index(
            "purchase_orders_status_delivery_date_idx",
            "status",
            "delivery_date",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )
    number: Mapped[str] = mapped_column(Text)
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
    )
    delivery_date: Mapped[date] = mapped_column(Date)
    status: Mapped[OrderStatus] = mapped_column(
        Text,
        default=OrderStatus.DRAFT,
        server_default=OrderStatus.DRAFT.value,
    )
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    supplier: Mapped[Supplier] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderItem.id",
    )
    receipt: Mapped["Receipt | None"] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        uselist=False,
    )
    status_history: Mapped[list["OrderStatusEvent"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderStatusEvent.created_at, OrderStatusEvent.id",
    )


class OrderStatusEvent(Base):
    __tablename__ = "order_status_events"
    __table_args__ = (
        CheckConstraint(
            (
                "event_type in ('created', 'status_changed', 'received', "
                "'snapshot', 'discrepancy_resolved', 'discrepancy_reopened')"
            ),
            name="order_status_events_type_check",
        ),
        CheckConstraint(
            (
                "from_status is null or from_status in "
                "('draft', 'sent', 'confirmed', 'delivered', 'cancelled')"
            ),
            name="order_status_events_from_status_check",
        ),
        CheckConstraint(
            (
                "to_status in "
                "('draft', 'sent', 'confirmed', 'delivered', 'cancelled')"
            ),
            name="order_status_events_to_status_check",
        ),
        Index(
            "order_status_events_order_created_idx",
            "order_id",
            "created_at",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"),
    )
    event_type: Mapped[OrderEventType] = mapped_column(Text)
    from_status: Mapped[OrderStatus | None] = mapped_column(Text, nullable=True)
    to_status: Mapped[OrderStatus] = mapped_column(Text)
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    order: Mapped[PurchaseOrder] = relationship(back_populates="status_history")


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="order_items_quantity_check"),
        CheckConstraint("unit_price >= 0", name="order_items_unit_price_check"),
        Index("order_items_order_id_idx", "order_id"),
        Index("order_items_product_id_idx", "product_id"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"),
    )
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=True,
    )
    product_name: Mapped[str] = mapped_column(Text)
    unit: Mapped[str] = mapped_column(Text)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    order: Mapped[PurchaseOrder] = relationship(back_populates="items")
    product: Mapped[Product | None] = relationship(back_populates="order_items")
    receipt_item: Mapped["ReceiptItem | None"] = relationship(
        back_populates="order_item",
        uselist=False,
    )


class Receipt(Base):
    __tablename__ = "receipts"
    __table_args__ = (
        UniqueConstraint("order_id", name="receipts_order_id_key"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"),
    )
    received_by: Mapped[str] = mapped_column(Text)
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    is_resolved: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
    )
    resolution_note: Mapped[str] = mapped_column(
        Text,
        default="",
        server_default="",
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    order: Mapped[PurchaseOrder] = relationship(back_populates="receipt")
    items: Mapped[list["ReceiptItem"]] = relationship(
        back_populates="receipt",
        cascade="all, delete-orphan",
        order_by="ReceiptItem.id",
    )


class ReceiptItem(Base):
    __tablename__ = "receipt_items"
    __table_args__ = (
        CheckConstraint(
            "received_quantity >= 0",
            name="receipt_items_received_quantity_check",
        ),
        CheckConstraint(
            "rejected_quantity >= 0",
            name="receipt_items_rejected_quantity_check",
        ),
        CheckConstraint(
            "rejected_quantity <= received_quantity",
            name="receipt_items_rejected_not_above_received_check",
        ),
        UniqueConstraint(
            "order_item_id",
            name="receipt_items_order_item_id_key",
        ),
        Index("receipt_items_receipt_id_idx", "receipt_id"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )
    receipt_id: Mapped[int] = mapped_column(
        ForeignKey("receipts.id", ondelete="CASCADE"),
    )
    order_item_id: Mapped[int] = mapped_column(
        ForeignKey("order_items.id", ondelete="CASCADE"),
    )
    received_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    rejected_quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 3),
        default=Decimal("0"),
        server_default="0",
    )
    note: Mapped[str] = mapped_column(Text, default="", server_default="")

    receipt: Mapped[Receipt] = relationship(back_populates="items")
    order_item: Mapped[OrderItem] = relationship(back_populates="receipt_item")
