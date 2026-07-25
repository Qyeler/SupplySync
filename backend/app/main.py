from datetime import UTC, date, datetime
from typing import Annotated
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_session
from app.domain import (
    can_edit_order,
    can_receive,
    can_set_product_active,
    can_set_supplier_active,
    can_transition,
    earliest_delivery_date,
)
from app.models import (
    OrderItem,
    OrderEventType,
    OrderStatus,
    OrderStatusEvent,
    Product,
    PurchaseOrder,
    Receipt,
    ReceiptItem,
    Supplier,
    SupplierProduct,
)
from app.schemas import (
    HealthRead,
    OrderCreate,
    OrderRead,
    OrderStatusUpdate,
    ProductCreate,
    ProductRead,
    ProductStatusUpdate,
    ProductUpdate,
    ReceiptCreate,
    ReceiptResolutionUpdate,
    SupplierCreate,
    SupplierRead,
    SupplierStatusUpdate,
    SupplierUpdate,
)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    summary="Purchasing operations API for SupplySync",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Session = Annotated[AsyncSession, Depends(get_session)]


def current_business_date() -> date:
    return datetime.now(ZoneInfo(settings.business_timezone)).date()


def order_query():
    return select(PurchaseOrder).options(
        selectinload(PurchaseOrder.supplier),
        selectinload(PurchaseOrder.items),
        selectinload(PurchaseOrder.receipt)
        .selectinload(Receipt.items)
        .selectinload(ReceiptItem.order_item),
        selectinload(PurchaseOrder.status_history),
    )


def product_query():
    return select(Product).options(
        selectinload(Product.offers).selectinload(SupplierProduct.supplier),
    )


async def validated_order_offers(
    payload: OrderCreate,
    session: AsyncSession,
) -> tuple[
    Supplier,
    dict[int, SupplierProduct],
    dict[int, Product],
]:
    supplier = await session.scalar(
        select(Supplier)
        .where(Supplier.id == payload.supplier_id)
        .with_for_update()
    )
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if not supplier.is_active:
        raise HTTPException(status_code=409, detail="Supplier is archived")

    earliest_date = earliest_delivery_date(
        current_business_date(),
        supplier.lead_time_days,
    )
    if payload.delivery_date < earliest_date:
        raise HTTPException(
            status_code=409,
            detail=(
                "Delivery date is earlier than supplier lead time "
                f"(earliest: {earliest_date.isoformat()})"
            ),
        )

    product_ids = {item.product_id for item in payload.items}
    product_result = await session.scalars(
        select(Product)
        .where(Product.id.in_(product_ids))
        .with_for_update()
    )
    products = {product.id: product for product in product_result}
    missing_product_records = product_ids - products.keys()
    if missing_product_records:
        raise HTTPException(
            status_code=409,
            detail=f"Products not found: {sorted(missing_product_records)}",
        )
    inactive_products = [
        product.id for product in products.values() if not product.is_active
    ]
    if inactive_products:
        raise HTTPException(
            status_code=409,
            detail=f"Products are inactive: {sorted(inactive_products)}",
        )

    offer_result = await session.scalars(
        select(SupplierProduct)
        .where(
            SupplierProduct.supplier_id == payload.supplier_id,
            SupplierProduct.product_id.in_(product_ids),
        )
        .with_for_update()
    )
    offers = {offer.product_id: offer for offer in offer_result}
    missing_products = product_ids - offers.keys()
    if missing_products:
        raise HTTPException(
            status_code=409,
            detail=(
                "Supplier has no active offer for products: "
                f"{sorted(missing_products)}"
            ),
        )
    below_minimum = [
        (
            item.product_id,
            item.quantity,
            offers[item.product_id].minimum_order,
        )
        for item in payload.items
        if item.quantity < offers[item.product_id].minimum_order
    ]
    if below_minimum:
        details = ", ".join(
            f"{product_id}: {quantity} < {minimum}"
            for product_id, quantity, minimum in below_minimum
        )
        raise HTTPException(
            status_code=409,
            detail=f"Quantity is below supplier minimum ({details})",
        )
    return supplier, offers, products


@app.get("/api/health", response_model=HealthRead, tags=["system"])
async def health() -> HealthRead:
    return HealthRead(status="ok", service="supplysync-api")


@app.get("/api/suppliers", response_model=list[SupplierRead], tags=["suppliers"])
async def list_suppliers(
    session: Session,
    active_only: bool = False,
) -> list[Supplier]:
    query = select(Supplier).order_by(Supplier.name)
    if active_only:
        query = query.where(Supplier.is_active.is_(True))
    result = await session.scalars(query)
    return list(result)


@app.post(
    "/api/suppliers",
    response_model=SupplierRead,
    status_code=status.HTTP_201_CREATED,
    tags=["suppliers"],
)
async def create_supplier(
    payload: SupplierCreate,
    session: Session,
) -> Supplier:
    supplier = Supplier(
        name=payload.name.strip(),
        contact_name=payload.contact_name.strip(),
        phone=payload.phone.strip(),
        lead_time_days=payload.lead_time_days,
    )
    session.add(supplier)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Supplier with this name already exists",
        ) from error
    return supplier


@app.patch(
    "/api/suppliers/{supplier_id}",
    response_model=SupplierRead,
    tags=["suppliers"],
)
async def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    session: Session,
) -> Supplier:
    supplier = await session.scalar(
        select(Supplier)
        .where(Supplier.id == supplier_id)
        .with_for_update()
    )
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")

    supplier.name = payload.name
    supplier.contact_name = payload.contact_name
    supplier.phone = payload.phone
    supplier.lead_time_days = payload.lead_time_days

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Supplier with this name already exists",
        ) from error
    return supplier


@app.patch(
    "/api/suppliers/{supplier_id}/status",
    response_model=SupplierRead,
    tags=["suppliers"],
)
async def update_supplier_status(
    supplier_id: int,
    payload: SupplierStatusUpdate,
    session: Session,
) -> Supplier:
    supplier = await session.scalar(
        select(Supplier)
        .where(Supplier.id == supplier_id)
        .with_for_update()
    )
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")

    if supplier.is_active != payload.is_active:
        open_order_number = await session.scalar(
            select(PurchaseOrder.number)
            .where(
                PurchaseOrder.supplier_id == supplier_id,
                PurchaseOrder.status.in_(
                    [
                        OrderStatus.DRAFT,
                        OrderStatus.SENT,
                        OrderStatus.CONFIRMED,
                    ]
                ),
            )
            .order_by(PurchaseOrder.id)
            .limit(1)
        )
        if not can_set_supplier_active(
            payload.is_active,
            open_order_number is not None,
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Поставщик используется в активной заявке "
                    f"{open_order_number}"
                ),
            )
        supplier.is_active = payload.is_active
        await session.commit()

    return supplier


@app.get("/api/products", response_model=list[ProductRead], tags=["products"])
async def list_products(
    session: Session,
    active_only: bool = True,
) -> list[Product]:
    query = product_query().order_by(Product.category, Product.name)
    if active_only:
        query = query.where(Product.is_active.is_(True))
    result = await session.scalars(query)
    return list(result.unique())


@app.post(
    "/api/products",
    response_model=ProductRead,
    status_code=status.HTTP_201_CREATED,
    tags=["products"],
)
async def create_product(
    payload: ProductCreate,
    session: Session,
) -> Product:
    supplier_ids = {offer.supplier_id for offer in payload.offers}
    supplier_records = {
        supplier.id: supplier
        for supplier in await session.scalars(
            select(Supplier)
            .where(Supplier.id.in_(supplier_ids))
            .with_for_update()
        )
    }
    missing_suppliers = supplier_ids - supplier_records.keys()
    if missing_suppliers:
        raise HTTPException(
            status_code=404,
            detail=f"Suppliers not found: {sorted(missing_suppliers)}",
        )
    inactive_suppliers = [
        supplier.id
        for supplier in supplier_records.values()
        if not supplier.is_active
    ]
    if inactive_suppliers:
        raise HTTPException(
            status_code=409,
            detail=f"Suppliers are archived: {sorted(inactive_suppliers)}",
        )

    product = Product(
        sku=payload.sku.strip().upper(),
        name=payload.name.strip(),
        category=payload.category.strip(),
        unit=payload.unit.strip(),
        offers=[
            SupplierProduct(
                supplier_id=offer.supplier_id,
                supplier_sku=offer.supplier_sku.strip(),
                unit_price=offer.unit_price,
                minimum_order=offer.minimum_order,
                is_preferred=offer.is_preferred,
            )
            for offer in payload.offers
        ],
    )
    session.add(product)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Product with this SKU already exists",
        ) from error

    created = await session.scalar(product_query().where(Product.id == product.id))
    if created is None:
        raise HTTPException(status_code=500, detail="Product could not be loaded")
    return created


@app.patch(
    "/api/products/{product_id}",
    response_model=ProductRead,
    tags=["products"],
)
async def update_product(
    product_id: int,
    payload: ProductUpdate,
    session: Session,
) -> Product:
    product = await session.scalar(
        select(Product)
        .options(selectinload(Product.offers))
        .where(Product.id == product_id)
        .with_for_update()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    supplier_ids = {offer.supplier_id for offer in payload.offers}
    supplier_records = {
        supplier.id: supplier
        for supplier in await session.scalars(
            select(Supplier)
            .where(Supplier.id.in_(supplier_ids))
            .with_for_update()
        )
    }
    missing_suppliers = supplier_ids - supplier_records.keys()
    if missing_suppliers:
        raise HTTPException(
            status_code=404,
            detail=f"Suppliers not found: {sorted(missing_suppliers)}",
        )
    current_supplier_ids = {offer.supplier_id for offer in product.offers}
    newly_archived_suppliers = [
        supplier.id
        for supplier in supplier_records.values()
        if not supplier.is_active and supplier.id not in current_supplier_ids
    ]
    if newly_archived_suppliers:
        raise HTTPException(
            status_code=409,
            detail=(
                "Suppliers are archived: "
                f"{sorted(newly_archived_suppliers)}"
            ),
        )

    current_offers = {
        offer.supplier_id: offer
        for offer in product.offers
    }
    next_offers: list[SupplierProduct] = []
    for payload_offer in payload.offers:
        offer = current_offers.get(payload_offer.supplier_id)
        if offer is None:
            offer = SupplierProduct(
                supplier_id=payload_offer.supplier_id,
                product_id=product.id,
            )
        offer.supplier_sku = payload_offer.supplier_sku.strip()
        offer.unit_price = payload_offer.unit_price
        offer.minimum_order = payload_offer.minimum_order
        offer.is_preferred = payload_offer.is_preferred
        next_offers.append(offer)

    product.sku = payload.sku.strip().upper()
    product.name = payload.name.strip()
    product.category = payload.category.strip()
    product.unit = payload.unit.strip()
    product.offers = next_offers

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Product with this SKU already exists",
        ) from error

    updated = await session.scalar(
        product_query()
        .where(Product.id == product.id)
        .execution_options(populate_existing=True)
    )
    if updated is None:
        raise HTTPException(status_code=500, detail="Product could not be loaded")
    return updated


@app.patch(
    "/api/products/{product_id}/status",
    response_model=ProductRead,
    tags=["products"],
)
async def update_product_status(
    product_id: int,
    payload: ProductStatusUpdate,
    session: Session,
) -> Product:
    product = await session.scalar(
        select(Product)
        .where(Product.id == product_id)
        .with_for_update()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.is_active != payload.is_active:
        draft_order_number = await session.scalar(
            select(PurchaseOrder.number)
            .join(OrderItem, OrderItem.order_id == PurchaseOrder.id)
            .where(
                OrderItem.product_id == product_id,
                PurchaseOrder.status == OrderStatus.DRAFT,
            )
            .limit(1)
        )
        if not can_set_product_active(
            payload.is_active,
            draft_order_number is not None,
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Товар используется в черновике "
                    f"{draft_order_number}"
                ),
            )
        product.is_active = payload.is_active
        await session.commit()

    updated = await session.scalar(
        product_query()
        .where(Product.id == product.id)
        .execution_options(populate_existing=True)
    )
    if updated is None:
        raise HTTPException(status_code=500, detail="Product could not be loaded")
    return updated


@app.get("/api/orders", response_model=list[OrderRead], tags=["orders"])
async def list_orders(
    session: Session,
    order_status: Annotated[OrderStatus | None, Query(alias="status")] = None,
) -> list[PurchaseOrder]:
    query = order_query().order_by(
        PurchaseOrder.delivery_date,
        PurchaseOrder.id.desc(),
    )
    if order_status is not None:
        query = query.where(PurchaseOrder.status == order_status)
    result = await session.scalars(query)
    return list(result.unique())


@app.post(
    "/api/orders",
    response_model=OrderRead,
    status_code=status.HTTP_201_CREATED,
    tags=["orders"],
)
async def create_order(payload: OrderCreate, session: Session) -> PurchaseOrder:
    _, offers, products = await validated_order_offers(payload, session)

    order = PurchaseOrder(
        number=f"SS-{payload.delivery_date:%y%m%d}-{uuid4().hex[:5].upper()}",
        supplier_id=payload.supplier_id,
        delivery_date=payload.delivery_date,
        note=payload.note.strip(),
        items=[
            OrderItem(
                product_id=item.product_id,
                product_name=products[item.product_id].name,
                unit=products[item.product_id].unit,
                quantity=item.quantity,
                unit_price=offers[item.product_id].unit_price,
            )
            for item in payload.items
        ],
        status_history=[
            OrderStatusEvent(
                event_type=OrderEventType.CREATED,
                from_status=None,
                to_status=OrderStatus.DRAFT,
            )
        ],
    )
    session.add(order)
    await session.commit()

    created = await session.scalar(order_query().where(PurchaseOrder.id == order.id))
    if created is None:
        raise HTTPException(status_code=500, detail="Order could not be loaded")
    return created


@app.patch(
    "/api/orders/{order_id}",
    response_model=OrderRead,
    tags=["orders"],
)
async def update_order(
    order_id: int,
    payload: OrderCreate,
    session: Session,
) -> PurchaseOrder:
    order = await session.scalar(
        order_query()
        .where(PurchaseOrder.id == order_id)
        .with_for_update()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if not can_edit_order(OrderStatus(order.status)):
        raise HTTPException(
            status_code=409,
            detail="Only a draft order can be edited",
        )

    _, offers, products = await validated_order_offers(payload, session)
    order.supplier_id = payload.supplier_id
    order.delivery_date = payload.delivery_date
    order.note = payload.note.strip()
    order.items = [
        OrderItem(
            product_id=item.product_id,
            product_name=products[item.product_id].name,
            unit=products[item.product_id].unit,
            quantity=item.quantity,
            unit_price=offers[item.product_id].unit_price,
        )
        for item in payload.items
    ]
    await session.commit()

    updated = await session.scalar(
        order_query()
        .where(PurchaseOrder.id == order.id)
        .execution_options(populate_existing=True)
    )
    if updated is None:
        raise HTTPException(status_code=500, detail="Order could not be loaded")
    return updated


@app.post(
    "/api/orders/{order_id}/receipt",
    response_model=OrderRead,
    status_code=status.HTTP_201_CREATED,
    tags=["receipts"],
)
async def receive_order(
    order_id: int,
    payload: ReceiptCreate,
    session: Session,
) -> PurchaseOrder:
    order = await session.scalar(
        order_query()
        .where(PurchaseOrder.id == order_id)
        .with_for_update()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.receipt is not None:
        raise HTTPException(status_code=409, detail="Order is already received")

    current_status = OrderStatus(order.status)
    if not can_receive(current_status):
        raise HTTPException(
            status_code=409,
            detail="Only a confirmed order can be received",
        )

    expected_item_ids = {item.id for item in order.items}
    payload_by_item_id = {item.order_item_id: item for item in payload.items}
    provided_item_ids = set(payload_by_item_id)
    if provided_item_ids != expected_item_ids:
        missing = sorted(expected_item_ids - provided_item_ids)
        unexpected = sorted(provided_item_ids - expected_item_ids)
        raise HTTPException(
            status_code=409,
            detail=(
                "Receipt lines must match order lines "
                f"(missing={missing}, unexpected={unexpected})"
            ),
        )

    unexplained_discrepancies = [
        order_item.id
        for order_item in order.items
        if (
            payload_by_item_id[order_item.id].received_quantity
            - payload_by_item_id[order_item.id].rejected_quantity
            != order_item.quantity
            or payload_by_item_id[order_item.id].rejected_quantity != 0
        )
        and not payload_by_item_id[order_item.id].note.strip()
    ]
    if unexplained_discrepancies:
        raise HTTPException(
            status_code=409,
            detail=(
                "A note is required for receipt discrepancies: "
                f"{unexplained_discrepancies}"
            ),
        )

    receipt = Receipt(
        order=order,
        received_by=payload.received_by.strip(),
        note=payload.note.strip(),
        items=[
            ReceiptItem(
                order_item=order_item,
                received_quantity=payload_by_item_id[
                    order_item.id
                ].received_quantity,
                rejected_quantity=payload_by_item_id[
                    order_item.id
                ].rejected_quantity,
                note=payload_by_item_id[order_item.id].note.strip(),
            )
            for order_item in order.items
        ],
    )
    order.status_history.append(
        OrderStatusEvent(
            event_type=OrderEventType.RECEIVED,
            from_status=current_status,
            to_status=OrderStatus.DELIVERED,
            note=payload.note.strip(),
        )
    )
    order.status = OrderStatus.DELIVERED
    session.add(receipt)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Order is already received",
        ) from error

    received = await session.scalar(
        order_query()
        .where(PurchaseOrder.id == order.id)
        .execution_options(populate_existing=True),
    )
    if received is None:
        raise HTTPException(status_code=500, detail="Receipt could not be loaded")
    return received


@app.patch(
    "/api/orders/{order_id}/receipt/resolution",
    response_model=OrderRead,
    tags=["receipts"],
)
async def update_receipt_resolution(
    order_id: int,
    payload: ReceiptResolutionUpdate,
    session: Session,
) -> PurchaseOrder:
    order = await session.scalar(
        order_query()
        .where(PurchaseOrder.id == order_id)
        .with_for_update()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.receipt is None:
        raise HTTPException(status_code=404, detail="Receipt not found")

    discrepancy_count = sum(
        (
            item.received_quantity
            - item.rejected_quantity
            != item.order_item.quantity
            or item.rejected_quantity != 0
        )
        for item in order.receipt.items
    )
    if discrepancy_count == 0:
        raise HTTPException(
            status_code=409,
            detail="Receipt has no discrepancies to resolve",
        )

    if order.receipt.is_resolved != payload.is_resolved:
        order.receipt.is_resolved = payload.is_resolved
        order.receipt.resolution_note = payload.note
        order.receipt.resolved_at = (
            datetime.now(UTC) if payload.is_resolved else None
        )
        order.status_history.append(
            OrderStatusEvent(
                event_type=(
                    OrderEventType.DISCREPANCY_RESOLVED
                    if payload.is_resolved
                    else OrderEventType.DISCREPANCY_REOPENED
                ),
                from_status=OrderStatus.DELIVERED,
                to_status=OrderStatus.DELIVERED,
                note=payload.note,
            )
        )
        await session.commit()

    updated = await session.scalar(
        order_query()
        .where(PurchaseOrder.id == order.id)
        .execution_options(populate_existing=True)
    )
    if updated is None:
        raise HTTPException(status_code=500, detail="Receipt could not be loaded")
    return updated


@app.patch(
    "/api/orders/{order_id}/status",
    response_model=OrderRead,
    tags=["orders"],
)
async def update_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    session: Session,
) -> PurchaseOrder:
    order = await session.scalar(
        order_query()
        .where(PurchaseOrder.id == order_id)
        .with_for_update()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    current_status = OrderStatus(order.status)
    if not can_transition(current_status, payload.status):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot move order from {current_status} to {payload.status}",
        )

    if current_status != payload.status:
        order.status_history.append(
            OrderStatusEvent(
                event_type=OrderEventType.STATUS_CHANGED,
                from_status=current_status,
                to_status=payload.status,
                note=payload.reason,
            )
        )
        order.status = payload.status
    await session.commit()
    updated = await session.scalar(order_query().where(PurchaseOrder.id == order.id))
    if updated is None:
        raise HTTPException(status_code=500, detail="Order could not be loaded")
    return updated


@app.options("/api/{path:path}", include_in_schema=False)
async def options_handler(path: str) -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)
