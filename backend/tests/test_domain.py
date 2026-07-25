from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.domain import (
    calculate_total,
    can_edit_order,
    can_receive,
    can_set_product_active,
    can_set_supplier_active,
    can_transition,
    earliest_delivery_date,
)
from app.models import OrderEventType, OrderStatus
from app.schemas import (
    OrderCreate,
    OrderStatusUpdate,
    ProductCreate,
    ProductUpdate,
    ReceiptCreate,
    ReceiptItemCreate,
    ReceiptResolutionUpdate,
    SupplierUpdate,
)
from app.seed import demo_status_history


@pytest.mark.parametrize(
    ("current", "target", "expected"),
    [
        (OrderStatus.DRAFT, OrderStatus.SENT, True),
        (OrderStatus.SENT, OrderStatus.CONFIRMED, True),
        (OrderStatus.CONFIRMED, OrderStatus.DELIVERED, False),
        (OrderStatus.SENT, OrderStatus.DELIVERED, False),
        (OrderStatus.DELIVERED, OrderStatus.DRAFT, False),
        (OrderStatus.CANCELLED, OrderStatus.SENT, False),
        (OrderStatus.DRAFT, OrderStatus.DRAFT, True),
    ],
)
def test_status_transitions(
    current: OrderStatus,
    target: OrderStatus,
    expected: bool,
) -> None:
    assert can_transition(current, target) is expected


def test_calculate_total_uses_decimal_arithmetic() -> None:
    total = calculate_total(
        [
            (Decimal("2.5"), Decimal("199.90")),
            (Decimal("3"), Decimal("50.15")),
        ]
    )

    assert total == Decimal("650.20")


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (OrderStatus.DRAFT, False),
        (OrderStatus.SENT, False),
        (OrderStatus.CONFIRMED, True),
        (OrderStatus.DELIVERED, False),
        (OrderStatus.CANCELLED, False),
    ],
)
def test_only_confirmed_order_can_be_received(
    status: OrderStatus,
    expected: bool,
) -> None:
    assert can_receive(status) is expected


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (OrderStatus.DRAFT, True),
        (OrderStatus.SENT, False),
        (OrderStatus.CONFIRMED, False),
        (OrderStatus.DELIVERED, False),
        (OrderStatus.CANCELLED, False),
    ],
)
def test_only_draft_order_can_be_edited(
    status: OrderStatus,
    expected: bool,
) -> None:
    assert can_edit_order(status) is expected


def test_earliest_delivery_date_applies_supplier_lead_time() -> None:
    assert earliest_delivery_date(date(2026, 7, 24), 4) == date(2026, 7, 28)


def test_supplier_update_strips_text_fields() -> None:
    supplier = SupplierUpdate(
        name="  Green Line  ",
        contact_name="  Vera Zimina ",
        phone="  +7 391 000-00-00  ",
        lead_time_days=2,
    )

    assert supplier.name == "Green Line"
    assert supplier.contact_name == "Vera Zimina"
    assert supplier.phone == "+7 391 000-00-00"


def test_supplier_update_rejects_blank_name() -> None:
    with pytest.raises(ValidationError):
        SupplierUpdate(
            name="   ",
            contact_name="Vera Zimina",
            phone="+7 391 000-00-00",
            lead_time_days=2,
        )


@pytest.mark.parametrize(
    ("target_active", "has_draft_orders", "expected"),
    [
        (True, False, True),
        (True, True, True),
        (False, False, True),
        (False, True, False),
    ],
)
def test_product_availability_respects_draft_orders(
    target_active: bool,
    has_draft_orders: bool,
    expected: bool,
) -> None:
    assert (
        can_set_product_active(target_active, has_draft_orders)
        is expected
    )


@pytest.mark.parametrize(
    ("target_active", "has_open_orders", "expected"),
    [
        (True, False, True),
        (True, True, True),
        (False, False, True),
        (False, True, False),
    ],
)
def test_supplier_availability_respects_open_orders(
    target_active: bool,
    has_open_orders: bool,
    expected: bool,
) -> None:
    assert (
        can_set_supplier_active(target_active, has_open_orders)
        is expected
    )


@pytest.mark.parametrize(
    ("status", "event_count", "last_type"),
    [
        (OrderStatus.DRAFT, 1, OrderEventType.CREATED),
        (OrderStatus.SENT, 2, OrderEventType.STATUS_CHANGED),
        (OrderStatus.CONFIRMED, 3, OrderEventType.STATUS_CHANGED),
        (OrderStatus.DELIVERED, 4, OrderEventType.RECEIVED),
    ],
)
def test_demo_status_history_reaches_current_state(
    status: OrderStatus,
    event_count: int,
    last_type: OrderEventType,
) -> None:
    history = demo_status_history(status)

    assert len(history) == event_count
    assert history[-1].event_type == last_type
    assert history[-1].to_status == status


def test_cancellation_requires_a_reason() -> None:
    with pytest.raises(ValidationError, match="reason is required"):
        OrderStatusUpdate(status=OrderStatus.CANCELLED, reason="  ")


def test_cancellation_reason_is_stripped() -> None:
    payload = OrderStatusUpdate(
        status=OrderStatus.CANCELLED,
        reason="  Поставщик отменил отгрузку  ",
    )

    assert payload.reason == "Поставщик отменил отгрузку"


def test_order_rejects_duplicate_products() -> None:
    with pytest.raises(ValidationError, match="only once"):
        OrderCreate(
            supplier_id=1,
            delivery_date=date.today(),
            items=[
                {"product_id": 10, "quantity": "2"},
                {"product_id": 10, "quantity": "3"},
            ],
        )


def test_product_rejects_duplicate_supplier_offers() -> None:
    with pytest.raises(ValidationError, match="only one offer"):
        ProductCreate(
            sku="TEST-1",
            name="Test product",
            category="Test",
            unit="kg",
            offers=[
                {"supplier_id": 1, "unit_price": "10"},
                {"supplier_id": 1, "unit_price": "11"},
            ],
        )


def test_product_rejects_multiple_preferred_suppliers() -> None:
    with pytest.raises(ValidationError, match="only one preferred supplier"):
        ProductCreate(
            sku="TEST-2",
            name="Test product",
            category="Test",
            unit="kg",
            offers=[
                {
                    "supplier_id": 1,
                    "unit_price": "10",
                    "is_preferred": True,
                },
                {
                    "supplier_id": 2,
                    "unit_price": "11",
                    "is_preferred": True,
                },
            ],
        )


def test_product_update_rejects_duplicate_supplier_offers() -> None:
    with pytest.raises(ValidationError, match="only one offer"):
        ProductUpdate(
            sku="TEST-3",
            name="Updated product",
            category="Test",
            unit="kg",
            offers=[
                {"supplier_id": 1, "unit_price": "10"},
                {"supplier_id": 1, "unit_price": "12"},
            ],
        )


def test_receipt_rejects_duplicate_order_items() -> None:
    with pytest.raises(ValidationError, match="only once"):
        ReceiptCreate(
            received_by="Test receiver",
            items=[
                {"order_item_id": 10, "received_quantity": "2"},
                {"order_item_id": 10, "received_quantity": "3"},
            ],
        )


def test_receipt_rejects_more_rejected_than_received() -> None:
    with pytest.raises(ValidationError, match="cannot exceed"):
        ReceiptItemCreate(
            order_item_id=10,
            received_quantity=Decimal("2"),
            rejected_quantity=Decimal("3"),
        )


def test_receipt_resolution_requires_a_meaningful_note() -> None:
    with pytest.raises(ValidationError, match="at least 3 characters"):
        ReceiptResolutionUpdate(is_resolved=True, note="  ")


def test_receipt_resolution_strips_note() -> None:
    payload = ReceiptResolutionUpdate(
        is_resolved=False,
        note="  Требуется повторная сверка  ",
    )

    assert payload.note == "Требуется повторная сверка"
