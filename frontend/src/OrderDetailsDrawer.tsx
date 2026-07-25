import {
  CalendarDays,
  CircleCheckBig,
  ClipboardCheck,
  Clock3,
  CopyPlus,
  PackageCheck,
  Pencil,
  RotateCcw,
  Truck,
  X,
} from "lucide-react";
import type {
  OrderEventType,
  OrderStatus,
  OrderStatusEvent,
  PurchaseOrder,
} from "./types";

const currency = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const quantity = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 3,
});

const fullDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const eventDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Черновик",
  sent: "Отправлена",
  confirmed: "Подтверждена",
  delivered: "Доставлена",
  cancelled: "Отменена",
};

const EVENT_LABELS: Record<OrderEventType, string> = {
  created: "Заявка создана",
  status_changed: "Статус изменён",
  received: "Поставка принята",
  snapshot: "Состояние зафиксировано",
  discrepancy_resolved: "Расхождения урегулированы",
  discrepancy_reopened: "Расхождения открыты повторно",
};

function eventDescription(event: OrderStatusEvent): string {
  if (event.event_type === "created") return STATUS_LABELS[event.to_status];
  if (event.event_type === "received") {
    return "Подтверждена → Доставлена";
  }
  if (event.event_type === "snapshot") {
    return STATUS_LABELS[event.to_status];
  }
  if (event.event_type === "discrepancy_resolved") {
    return "Расхождения → Урегулированы";
  }
  if (event.event_type === "discrepancy_reopened") {
    return "Урегулированы → Открыты";
  }
  return `${event.from_status ? STATUS_LABELS[event.from_status] : "—"} → ${
    STATUS_LABELS[event.to_status]
  }`;
}

function eventCountLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} событий`;
  if (last === 1) return `${count} событие`;
  if (last >= 2 && last <= 4) return `${count} события`;
  return `${count} событий`;
}

export function OrderDetailsDrawer({
  order,
  onClose,
  onEdit,
  onReceipt,
  onRepeat,
  onResolve,
}: {
  order: PurchaseOrder;
  onClose: () => void;
  onEdit: (order: PurchaseOrder) => void;
  onReceipt: (order: PurchaseOrder) => void;
  onRepeat: (order: PurchaseOrder) => void;
  onResolve: (order: PurchaseOrder) => void;
}) {
  const history = [...order.status_history].reverse();

  return (
    <div className="drawer-layer" role="presentation">
      <button
        aria-label="Закрыть карточку заявки"
        className="drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="order-details-title"
        aria-modal="true"
        className="order-drawer order-details-drawer"
        role="dialog"
      >
        <header className="drawer-header">
          <div>
            <span className="drawer-kicker">Карточка заявки</span>
            <h2 id="order-details-title">{order.number}</h2>
          </div>
          <button
            aria-label="Закрыть"
            className="icon-button"
            onClick={onClose}
            title="Закрыть"
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        <div className="order-form order-details-content">
          <section className="order-details-summary">
            <div>
              <span className={`status-pill status-${order.status}`}>
                {STATUS_LABELS[order.status]}
              </span>
              <strong>{currency.format(Number(order.total))}</strong>
            </div>
            <dl>
              <div>
                <dt>Поставщик</dt>
                <dd>{order.supplier.name}</dd>
                <small>{order.supplier.contact_name}</small>
              </div>
              <div>
                <dt>Доставка</dt>
                <dd>{fullDate.format(new Date(order.delivery_date))}</dd>
                <small>{order.supplier.lead_time_days} дн. по договору</small>
              </div>
            </dl>
          </section>

          <section className="order-details-section">
            <header>
              <div>
                <h3>Состав</h3>
                <span>{order.items.length} поз.</span>
              </div>
              <PackageCheck size={18} />
            </header>
            <div className="order-details-items">
              {order.items.map((item, index) => (
                <div className="order-details-item" key={item.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{item.product_name}</strong>
                    <small>
                      {quantity.format(Number(item.quantity))} {item.unit} ×{" "}
                      {currency.format(Number(item.unit_price))}
                    </small>
                  </div>
                  <strong>{currency.format(Number(item.line_total))}</strong>
                </div>
              ))}
            </div>
          </section>

          {order.note && (
            <section className="order-details-note">
              <span>Комментарий</span>
              <p>{order.note}</p>
            </section>
          )}

          {order.receipt && (
            <section
              className={`order-details-receipt ${
                order.receipt.discrepancy_count
                  ? order.receipt.is_resolved
                    ? "is-resolved"
                    : "has-discrepancies"
                  : ""
              }`}
            >
              <ClipboardCheck size={19} />
              <div>
                <span>Акт приёмки</span>
                <strong>
                  {order.receipt.discrepancy_count
                    ? order.receipt.is_resolved
                      ? "Расхождения урегулированы"
                      : `${order.receipt.discrepancy_count} расхожд. открыто`
                    : "Без расхождений"}
                </strong>
                {order.receipt.resolution_note && (
                  <small>{order.receipt.resolution_note}</small>
                )}
              </div>
              <div>
                <span>Принято на сумму</span>
                <strong>
                  {currency.format(Number(order.receipt.accepted_total))}
                </strong>
              </div>
            </section>
          )}

          <section className="order-details-section">
            <header>
              <div>
                <h3>История</h3>
                <span>{eventCountLabel(history.length)}</span>
              </div>
              <Clock3 size={18} />
            </header>
            <div className="order-timeline">
              {history.map((event) => (
                <div className="order-timeline-event" key={event.id}>
                  <span className="timeline-node" />
                  <div>
                    <strong>{EVENT_LABELS[event.event_type]}</strong>
                    <small>{eventDescription(event)}</small>
                    {event.note && <p>{event.note}</p>}
                  </div>
                  <time dateTime={event.created_at}>
                    {eventDate.format(new Date(event.created_at))}
                  </time>
                </div>
              ))}
            </div>
          </section>

          <footer className="drawer-footer order-details-footer">
            <div className="order-total">
              <span>Дата поставки</span>
              <strong>
                <CalendarDays size={16} />
                {fullDate.format(new Date(order.delivery_date))}
              </strong>
            </div>
            <div className="order-details-actions">
              <button
                className="quiet-button"
                onClick={() => onRepeat(order)}
                type="button"
              >
                <CopyPlus size={17} />
                Повторить
              </button>
              {order.status === "draft" && (
                <button
                  className="primary-button"
                  onClick={() => onEdit(order)}
                  type="button"
                >
                  <Pencil size={17} />
                  Редактировать
                </button>
              )}
              {order.status === "confirmed" && (
                <button
                  className="primary-button"
                  onClick={() => onReceipt(order)}
                  type="button"
                >
                  <Truck size={17} />
                  Принять поставку
                </button>
              )}
              {order.status === "delivered" &&
                order.receipt &&
                order.receipt.discrepancy_count === 0 && (
                <button
                  className="primary-button"
                  onClick={() => onReceipt(order)}
                  type="button"
                >
                  <ClipboardCheck size={17} />
                  Открыть акт
                </button>
              )}
              {order.status === "delivered" &&
                order.receipt &&
                order.receipt.discrepancy_count > 0 && (
                  <>
                    <button
                      className="quiet-button"
                      onClick={() => onReceipt(order)}
                      type="button"
                    >
                      <ClipboardCheck size={17} />
                      Открыть акт
                    </button>
                    <button
                      className={
                        order.receipt.is_resolved
                          ? "secondary-button"
                          : "primary-button"
                      }
                      onClick={() => onResolve(order)}
                      type="button"
                    >
                      {order.receipt.is_resolved ? (
                        <RotateCcw size={17} />
                      ) : (
                        <CircleCheckBig size={17} />
                      )}
                      {order.receipt.is_resolved
                        ? "Открыть повторно"
                        : "Урегулировать"}
                    </button>
                  </>
                )}
            </div>
          </footer>
        </div>
      </aside>
    </div>
  );
}
