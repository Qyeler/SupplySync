from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.models import OrderEventType, OrderStatus


class SupplierRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    contact_name: str
    phone: str
    lead_time_days: int
    is_active: bool


class SupplierCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=160)
    contact_name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=5, max_length=40)
    lead_time_days: int = Field(ge=0, le=365)


class SupplierUpdate(SupplierCreate):
    pass


class SupplierStatusUpdate(BaseModel):
    is_active: bool


class SupplierOfferCreate(BaseModel):
    supplier_id: int
    supplier_sku: str = Field(default="", max_length=80)
    unit_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    minimum_order: Decimal = Field(
        default=Decimal("1"),
        gt=0,
        max_digits=12,
        decimal_places=3,
    )
    is_preferred: bool = False


class SupplierOfferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    supplier_id: int
    supplier: SupplierRead
    supplier_sku: str
    unit_price: Decimal
    minimum_order: Decimal
    is_preferred: bool
    updated_at: datetime


class ProductWrite(BaseModel):
    sku: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=160)
    category: str = Field(min_length=2, max_length=100)
    unit: str = Field(min_length=1, max_length=20)
    offers: list[SupplierOfferCreate] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def supplier_offers_are_unique(self) -> "ProductWrite":
        supplier_ids = [offer.supplier_id for offer in self.offers]
        if len(supplier_ids) != len(set(supplier_ids)):
            raise ValueError("Each supplier can have only one offer per product")
        if sum(offer.is_preferred for offer in self.offers) > 1:
            raise ValueError("A product can have only one preferred supplier")
        return self


class ProductCreate(ProductWrite):
    pass


class ProductUpdate(ProductWrite):
    pass


class ProductStatusUpdate(BaseModel):
    is_active: bool


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    name: str
    category: str
    unit: str
    is_active: bool
    created_at: datetime
    offers: list[SupplierOfferRead]


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int | None
    product_name: str
    unit: str
    quantity: Decimal
    unit_price: Decimal

    @computed_field
    @property
    def line_total(self) -> Decimal:
        return self.quantity * self.unit_price


class ReceiptItemCreate(BaseModel):
    order_item_id: int
    received_quantity: Decimal = Field(
        ge=0,
        max_digits=12,
        decimal_places=3,
    )
    rejected_quantity: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        max_digits=12,
        decimal_places=3,
    )
    note: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def rejected_quantity_is_not_above_received(self) -> "ReceiptItemCreate":
        if self.rejected_quantity > self.received_quantity:
            raise ValueError("Rejected quantity cannot exceed received quantity")
        return self


class ReceiptCreate(BaseModel):
    received_by: str = Field(min_length=2, max_length=160)
    note: str = Field(default="", max_length=1000)
    items: list[ReceiptItemCreate] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def order_items_are_unique(self) -> "ReceiptCreate":
        order_item_ids = [item.order_item_id for item in self.items]
        if len(order_item_ids) != len(set(order_item_ids)):
            raise ValueError("Each order item can appear only once per receipt")
        return self


class ReceiptResolutionUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    is_resolved: bool
    note: str = Field(min_length=3, max_length=1000)


class ReceiptItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_item_id: int
    order_item: OrderItemRead
    received_quantity: Decimal
    rejected_quantity: Decimal
    note: str

    @computed_field
    @property
    def accepted_quantity(self) -> Decimal:
        return self.received_quantity - self.rejected_quantity

    @computed_field
    @property
    def quantity_variance(self) -> Decimal:
        return self.accepted_quantity - self.order_item.quantity

    @computed_field
    @property
    def has_discrepancy(self) -> bool:
        return self.quantity_variance != 0 or self.rejected_quantity != 0


class ReceiptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    received_by: str
    note: str
    is_resolved: bool
    resolution_note: str
    resolved_at: datetime | None
    received_at: datetime
    items: list[ReceiptItemRead]

    @computed_field
    @property
    def discrepancy_count(self) -> int:
        return sum(item.has_discrepancy for item in self.items)

    @computed_field
    @property
    def accepted_total(self) -> Decimal:
        return sum(
            (
                item.accepted_quantity * item.order_item.unit_price
                for item in self.items
            ),
            Decimal("0.00"),
        )


class OrderCreate(BaseModel):
    supplier_id: int
    delivery_date: date
    note: str = Field(default="", max_length=1000)
    items: list[OrderItemCreate] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def products_are_unique(self) -> "OrderCreate":
        product_ids = [item.product_id for item in self.items]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("Each product can appear only once per order")
        return self


class OrderStatusUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    status: OrderStatus
    reason: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def cancellation_has_reason(self) -> "OrderStatusUpdate":
        if self.status == OrderStatus.CANCELLED and len(self.reason) < 3:
            raise ValueError("Cancellation reason is required")
        return self


class OrderStatusEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: OrderEventType
    from_status: OrderStatus | None
    to_status: OrderStatus
    note: str
    created_at: datetime


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str
    supplier: SupplierRead
    delivery_date: date
    status: OrderStatus
    note: str
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemRead]
    receipt: ReceiptRead | None = None
    status_history: list[OrderStatusEventRead]

    @computed_field
    @property
    def total(self) -> Decimal:
        return sum((item.line_total for item in self.items), Decimal("0.00"))


class HealthRead(BaseModel):
    status: str
    service: str
