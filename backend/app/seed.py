import asyncio
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.database import SessionFactory
from app.models import (
    OrderEventType,
    OrderItem,
    OrderStatus,
    OrderStatusEvent,
    Product,
    PurchaseOrder,
    Receipt,
    ReceiptItem,
    Supplier,
    SupplierProduct,
)


SUPPLIERS = [
    {
        "name": "Северные фермы",
        "contact_name": "Марина Волкова",
        "phone": "+7 391 240-18-62",
        "lead_time_days": 2,
    },
    {
        "name": "Речной улов",
        "contact_name": "Антон Корнеев",
        "phone": "+7 391 205-73-11",
        "lead_time_days": 1,
    },
    {
        "name": "Точка кофе",
        "contact_name": "Олег Миронов",
        "phone": "+7 391 271-09-44",
        "lead_time_days": 4,
    },
    {
        "name": "Зелёная линия",
        "contact_name": "Вера Зимина",
        "phone": "+7 391 217-35-80",
        "lead_time_days": 1,
    },
]

CATALOG = [
    {
        "sku": "DAIRY-CRM-33",
        "name": "Сливки 33%",
        "category": "Молочные продукты",
        "unit": "л",
        "offers": [
            ("Северные фермы", "SF-CRM-33", "415", "6", True),
        ],
    },
    {
        "sku": "DAIRY-BUT-82",
        "name": "Масло сливочное",
        "category": "Молочные продукты",
        "unit": "кг",
        "offers": [
            ("Северные фермы", "SF-BUT-82", "890", "5", True),
        ],
    },
    {
        "sku": "FISH-TRT-C",
        "name": "Форель охлаждённая",
        "category": "Рыба и морепродукты",
        "unit": "кг",
        "offers": [
            ("Речной улов", "RU-TRT-C", "1280", "8", True),
        ],
    },
    {
        "sku": "GREENS-PEA",
        "name": "Микрозелень гороха",
        "category": "Овощи и зелень",
        "unit": "уп.",
        "offers": [
            ("Зелёная линия", "GL-MIC-PEA", "165", "10", True),
            ("Северные фермы", "SF-MIC-PEA", "180", "12", False),
        ],
    },
    {
        "sku": "VEG-TOM-P",
        "name": "Томаты розовые",
        "category": "Овощи и зелень",
        "unit": "кг",
        "offers": [
            ("Зелёная линия", "GL-TOM-P", "340", "5", True),
            ("Северные фермы", "SF-TOM-P", "360", "8", False),
        ],
    },
    {
        "sku": "COFFEE-ESP",
        "name": "Кофе эспрессо-смесь",
        "category": "Напитки",
        "unit": "кг",
        "offers": [
            ("Точка кофе", "TC-ESP-1K", "1890", "2", True),
        ],
    },
    {
        "sku": "MILK-OAT-BR",
        "name": "Молоко овсяное Barista",
        "category": "Напитки",
        "unit": "л",
        "offers": [
            ("Точка кофе", "TC-OAT-BR", "280", "12", True),
            ("Северные фермы", "SF-OAT-BR", "295", "12", False),
        ],
    },
    {
        "sku": "SYR-VAN-1",
        "name": "Сироп ванильный",
        "category": "Напитки",
        "unit": "бут.",
        "offers": [
            ("Точка кофе", "TC-SYR-VAN", "690", "2", True),
        ],
    },
]


def demo_status_history(status: OrderStatus) -> list[OrderStatusEvent]:
    events = [
        OrderStatusEvent(
            event_type=OrderEventType.CREATED,
            from_status=None,
            to_status=OrderStatus.DRAFT,
        )
    ]
    transitions = [
        (OrderStatus.DRAFT, OrderStatus.SENT),
        (OrderStatus.SENT, OrderStatus.CONFIRMED),
        (OrderStatus.CONFIRMED, OrderStatus.DELIVERED),
    ]
    for current, target in transitions:
        if status not in {
            target,
            OrderStatus.CONFIRMED,
            OrderStatus.DELIVERED,
        }:
            break
        events.append(
            OrderStatusEvent(
                event_type=(
                    OrderEventType.RECEIVED
                    if target == OrderStatus.DELIVERED
                    else OrderEventType.STATUS_CHANGED
                ),
                from_status=current,
                to_status=target,
            )
        )
        if target == status:
            break
    return events


async def ensure_suppliers(session) -> dict[str, Supplier]:
    existing = {
        supplier.name: supplier
        for supplier in await session.scalars(select(Supplier))
    }
    for payload in SUPPLIERS:
        if payload["name"] not in existing:
            supplier = Supplier(**payload)
            session.add(supplier)
            existing[payload["name"]] = supplier
    await session.flush()
    return existing


async def ensure_catalog(
    session,
    suppliers: dict[str, Supplier],
) -> dict[str, Product]:
    products = {
        product.sku: product
        for product in await session.scalars(select(Product))
    }
    for payload in CATALOG:
        if payload["sku"] not in products:
            product = Product(
                sku=payload["sku"],
                name=payload["name"],
                category=payload["category"],
                unit=payload["unit"],
            )
            session.add(product)
            products[payload["sku"]] = product
    await session.flush()

    existing_offers = {
        (offer.supplier_id, offer.product_id)
        for offer in await session.scalars(select(SupplierProduct))
    }
    for payload in CATALOG:
        product = products[payload["sku"]]
        for supplier_name, supplier_sku, price, minimum, preferred in payload[
            "offers"
        ]:
            supplier = suppliers[supplier_name]
            offer_key = (supplier.id, product.id)
            if offer_key not in existing_offers:
                session.add(
                    SupplierProduct(
                        supplier_id=supplier.id,
                        product_id=product.id,
                        supplier_sku=supplier_sku,
                        unit_price=Decimal(price),
                        minimum_order=Decimal(minimum),
                        is_preferred=preferred,
                    )
                )
                existing_offers.add(offer_key)
    await session.flush()
    return products


async def ensure_demo_orders(
    session,
    suppliers: dict[str, Supplier],
    products: dict[str, Product],
) -> None:
    existing = await session.scalar(select(PurchaseOrder.id).limit(1))
    if existing is not None:
        return

    today = date.today()
    received_item = OrderItem(
        product_id=products["GREENS-PEA"].id,
        product_name="Микрозелень гороха",
        unit="уп.",
        quantity=Decimal("10"),
        unit_price=Decimal("165"),
    )
    delivered_order = PurchaseOrder(
        number="SS-DEMO-004",
        supplier_id=suppliers["Зелёная линия"].id,
        delivery_date=today - timedelta(days=1),
        status=OrderStatus.DELIVERED,
        note="Недопоставка одной упаковки зафиксирована при приёмке.",
        items=[received_item],
        status_history=demo_status_history(OrderStatus.DELIVERED),
    )
    delivered_order.receipt = Receipt(
        received_by="Мария К.",
        note="Поставка принята с расхождением.",
        items=[
            ReceiptItem(
                order_item=received_item,
                received_quantity=Decimal("9"),
                rejected_quantity=Decimal("0"),
                note="Недопоставка: одна упаковка не отгружена.",
            )
        ],
    )

    session.add_all(
        [
            PurchaseOrder(
                number="SS-DEMO-001",
                supplier_id=suppliers["Северные фермы"].id,
                delivery_date=today + timedelta(days=1),
                status=OrderStatus.CONFIRMED,
                note="Приёмка через служебный вход до 11:00.",
                status_history=demo_status_history(OrderStatus.CONFIRMED),
                items=[
                    OrderItem(
                        product_id=products["DAIRY-CRM-33"].id,
                        product_name="Сливки 33%",
                        unit="л",
                        quantity=Decimal("18"),
                        unit_price=Decimal("415"),
                    ),
                    OrderItem(
                        product_id=products["DAIRY-BUT-82"].id,
                        product_name="Масло сливочное",
                        unit="кг",
                        quantity=Decimal("12"),
                        unit_price=Decimal("890"),
                    ),
                ],
            ),
            PurchaseOrder(
                number="SS-DEMO-002",
                supplier_id=suppliers["Речной улов"].id,
                delivery_date=today,
                status=OrderStatus.SENT,
                note="Подтвердить вес после вылова.",
                status_history=demo_status_history(OrderStatus.SENT),
                items=[
                    OrderItem(
                        product_id=products["FISH-TRT-C"].id,
                        product_name="Форель охлаждённая",
                        unit="кг",
                        quantity=Decimal("24"),
                        unit_price=Decimal("1280"),
                    ),
                ],
            ),
            PurchaseOrder(
                number="SS-DEMO-003",
                supplier_id=suppliers["Зелёная линия"].id,
                delivery_date=today + timedelta(days=3),
                status=OrderStatus.DRAFT,
                note="",
                status_history=demo_status_history(OrderStatus.DRAFT),
                items=[
                    OrderItem(
                        product_id=products["GREENS-PEA"].id,
                        product_name="Микрозелень гороха",
                        unit="уп.",
                        quantity=Decimal("30"),
                        unit_price=Decimal("165"),
                    ),
                    OrderItem(
                        product_id=products["VEG-TOM-P"].id,
                        product_name="Томаты розовые",
                        unit="кг",
                        quantity=Decimal("18"),
                        unit_price=Decimal("340"),
                    ),
                ],
            ),
            delivered_order,
        ]
    )


async def link_historical_items(
    session,
    products: dict[str, Product],
) -> None:
    products_by_name = {product.name: product for product in products.values()}
    unlinked_items = list(
        await session.scalars(
            select(OrderItem).where(OrderItem.product_id.is_(None)),
        )
    )
    for item in unlinked_items:
        product = products_by_name.get(item.product_name)
        if product is not None:
            item.product_id = product.id


async def seed() -> None:
    async with SessionFactory() as session:
        suppliers = await ensure_suppliers(session)
        products = await ensure_catalog(session, suppliers)
        await ensure_demo_orders(session, suppliers, products)
        await link_historical_items(session, products)
        await session.commit()


if __name__ == "__main__":
    asyncio.run(seed())
