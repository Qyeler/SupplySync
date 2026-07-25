import {
  AlertTriangle,
  ClipboardCheck,
  RefreshCw,
  Scale,
  X,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type {
  PurchaseOrder,
  ReceiptDraft,
  ReceiptItemDraft,
} from "./types";

const currency = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const quantity = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 3,
});

const receivedAt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatVariance(value: number, unit: string): string {
  if (Math.abs(value) < 0.0005) return `0 ${unit}`;
  const sign = value > 0 ? "+" : "−";
  return `${sign}${quantity.format(Math.abs(value))} ${unit}`;
}

function initialLines(order: PurchaseOrder): ReceiptItemDraft[] {
  return order.items.map((item) => {
    const receiptItem = order.receipt?.items.find(
      (candidate) => candidate.order_item_id === item.id,
    );
    return {
      order_item_id: item.id,
      received_quantity: Number(receiptItem?.received_quantity ?? item.quantity),
      rejected_quantity: Number(receiptItem?.rejected_quantity ?? 0),
      note: receiptItem?.note ?? "",
    };
  });
}

export function ReceiptDrawer({
  order,
  busy,
  onClose,
  onReceive,
}: {
  order: PurchaseOrder;
  busy: boolean;
  onClose: () => void;
  onReceive: (orderId: number, draft: ReceiptDraft) => Promise<void>;
}) {
  const readOnly = order.receipt !== null;
  const [receivedBy, setReceivedBy] = useState(
    order.receipt?.received_by ?? "Мария К.",
  );
  const [note, setNote] = useState(order.receipt?.note ?? "");
  const [lines, setLines] = useState<ReceiptItemDraft[]>(initialLines(order));
  const [error, setError] = useState("");

  const facts = useMemo(
    () =>
      lines.map((line) => {
        const orderItem = order.items.find(
          (item) => item.id === line.order_item_id,
        );
        const ordered = Number(orderItem?.quantity ?? 0);
        const accepted = line.received_quantity - line.rejected_quantity;
        const variance = accepted - ordered;
        return {
          ...line,
          orderItem,
          ordered,
          accepted,
          variance,
          hasDiscrepancy:
            Math.abs(variance) >= 0.0005 || line.rejected_quantity > 0,
        };
      }),
    [lines, order.items],
  );

  const discrepancyCount = facts.filter(
    (line) => line.hasDiscrepancy,
  ).length;
  const acceptedTotal = facts.reduce(
    (total, line) =>
      total + line.accepted * Number(line.orderItem?.unit_price ?? 0),
    0,
  );

  function updateLine(
    orderItemId: number,
    patch: Partial<ReceiptItemDraft>,
  ) {
    setLines((current) =>
      current.map((line) =>
        line.order_item_id === orderItemId ? { ...line, ...patch } : line,
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    if (receivedBy.trim().length < 2) {
      setError("Укажите сотрудника, который принял поставку");
      return;
    }
    if (
      lines.some(
        (line) =>
          line.received_quantity < 0 ||
          line.rejected_quantity < 0 ||
          line.rejected_quantity > line.received_quantity,
      )
    ) {
      setError("Брак не может превышать фактически полученное количество");
      return;
    }
    const unexplained = facts.find(
      (line) => line.hasDiscrepancy && !line.note.trim(),
    );
    if (unexplained) {
      setError(
        `Укажите причину расхождения для «${unexplained.orderItem?.product_name}»`,
      );
      return;
    }

    setError("");
    await onReceive(order.id, {
      received_by: receivedBy,
      note,
      items: lines,
    });
  }

  return (
    <div className="drawer-layer" role="presentation">
      <button
        aria-label="Закрыть форму приёмки"
        className="drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="receipt-title"
        aria-modal="true"
        className="order-drawer receipt-drawer"
        role="dialog"
      >
        <header className="drawer-header">
          <div>
            <span className="drawer-kicker">
              {readOnly ? "Акт приёмки" : "Приёмка поставки"}
            </span>
            <h2 id="receipt-title">{order.number}</h2>
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

        <form className="order-form receipt-form" onSubmit={submit}>
          <div className="receipt-context">
            <ClipboardCheck size={20} />
            <span>
              Поставщик
              <strong>{order.supplier.name}</strong>
            </span>
            <span>
              Позиций
              <strong>{order.items.length}</strong>
            </span>
            {order.receipt && (
              <span>
                Принято
                <strong>{receivedAt.format(new Date(order.receipt.received_at))}</strong>
              </span>
            )}
          </div>

          <div className="form-grid receipt-meta-grid">
            <label className="field field-wide">
              <span>Принял</span>
              <input
                disabled={readOnly}
                maxLength={160}
                onChange={(event) => setReceivedBy(event.target.value)}
                required
                value={receivedBy}
              />
            </label>
            <label className="field field-wide">
              <span>Комментарий к акту</span>
              <input
                disabled={readOnly}
                maxLength={1000}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Номер накладной или общий комментарий"
                value={note}
              />
            </label>
          </div>

          <div className="line-items-heading receipt-heading">
            <div>
              <h3>Сверка позиций</h3>
              <span>
                {discrepancyCount
                  ? `${discrepancyCount} с расхождением`
                  : "количество совпадает"}
              </span>
            </div>
            <Scale size={18} />
          </div>

          <div className="receipt-lines">
            {facts.map((line, index) => (
              <article
                className={`receipt-line ${
                  line.hasDiscrepancy ? "has-discrepancy" : ""
                }`}
                key={line.order_item_id}
              >
                <header>
                  <div>
                    <span className="line-item-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <strong>{line.orderItem?.product_name}</strong>
                  </div>
                  <span
                    className={`receipt-line-state ${
                      line.hasDiscrepancy ? "is-variance" : ""
                    }`}
                  >
                    {line.hasDiscrepancy ? "Расхождение" : "Совпадает"}
                  </span>
                </header>

                <div className="receipt-values">
                  <div className="receipt-readout">
                    <span>Заказано</span>
                    <strong>
                      {quantity.format(line.ordered)} {line.orderItem?.unit}
                    </strong>
                  </div>

                  {readOnly ? (
                    <div className="receipt-readout">
                      <span>Получено</span>
                      <strong>
                        {quantity.format(line.received_quantity)}{" "}
                        {line.orderItem?.unit}
                      </strong>
                    </div>
                  ) : (
                    <label className="field">
                      <span>Получено</span>
                      <input
                        min="0"
                        onChange={(event) =>
                          updateLine(line.order_item_id, {
                            received_quantity: Number(event.target.value),
                          })
                        }
                        required
                        step="0.001"
                        type="number"
                        value={line.received_quantity}
                      />
                    </label>
                  )}

                  {readOnly ? (
                    <div className="receipt-readout">
                      <span>Брак</span>
                      <strong>
                        {quantity.format(line.rejected_quantity)}{" "}
                        {line.orderItem?.unit}
                      </strong>
                    </div>
                  ) : (
                    <label className="field">
                      <span>Брак</span>
                      <input
                        max={line.received_quantity}
                        min="0"
                        onChange={(event) =>
                          updateLine(line.order_item_id, {
                            rejected_quantity: Number(event.target.value),
                          })
                        }
                        required
                        step="0.001"
                        type="number"
                        value={line.rejected_quantity}
                      />
                    </label>
                  )}

                  <div
                    className={`receipt-readout receipt-variance ${
                      line.hasDiscrepancy ? "is-variance" : ""
                    }`}
                  >
                    <span>Отклонение</span>
                    <strong>
                      {formatVariance(
                        line.variance,
                        line.orderItem?.unit ?? "",
                      )}
                    </strong>
                  </div>
                </div>

                {line.hasDiscrepancy && (
                  <label className="field receipt-reason">
                    <span>Причина расхождения</span>
                    <textarea
                      disabled={readOnly}
                      maxLength={500}
                      onChange={(event) =>
                        updateLine(line.order_item_id, {
                          note: event.target.value,
                        })
                      }
                      placeholder="Недопоставка, повреждение или замена"
                      required
                      rows={2}
                      value={line.note}
                    />
                  </label>
                )}
              </article>
            ))}
          </div>

          {error && (
            <div className="form-error" role="alert">
              <AlertTriangle size={17} />
              {error}
            </div>
          )}

          <footer className="drawer-footer receipt-footer">
            <div className="receipt-total">
              <span>Принято на</span>
              <strong>{currency.format(acceptedTotal)}</strong>
              <small>
                {discrepancyCount
                  ? `Расхождений: ${discrepancyCount}`
                  : "Без расхождений"}
              </small>
            </div>
            {readOnly ? (
              <button className="quiet-button" onClick={onClose} type="button">
                Закрыть акт
              </button>
            ) : (
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? (
                  <RefreshCw className="spin" size={18} />
                ) : (
                  <ClipboardCheck size={18} />
                )}
                {busy ? "Сохраняем..." : "Завершить приёмку"}
              </button>
            )}
          </footer>
        </form>
      </aside>
    </div>
  );
}
