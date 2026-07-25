from datetime import date, timedelta
from decimal import Decimal

from app.models import OrderStatus


ALLOWED_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.DRAFT: {OrderStatus.SENT, OrderStatus.CANCELLED},
    OrderStatus.SENT: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.CANCELLED},
    OrderStatus.DELIVERED: set(),
    OrderStatus.CANCELLED: set(),
}


def can_transition(current: OrderStatus, target: OrderStatus) -> bool:
    return target == current or target in ALLOWED_TRANSITIONS[current]


def can_receive(current: OrderStatus) -> bool:
    return current == OrderStatus.CONFIRMED


def can_edit_order(current: OrderStatus) -> bool:
    return current == OrderStatus.DRAFT


def earliest_delivery_date(start: date, lead_time_days: int) -> date:
    return start + timedelta(days=lead_time_days)


def can_set_product_active(
    target_active: bool,
    has_draft_orders: bool,
) -> bool:
    return target_active or not has_draft_orders


def can_set_supplier_active(
    target_active: bool,
    has_open_orders: bool,
) -> bool:
    return target_active or not has_open_orders


def calculate_total(lines: list[tuple[Decimal, Decimal]]) -> Decimal:
    return sum((quantity * price for quantity, price in lines), Decimal("0.00"))
