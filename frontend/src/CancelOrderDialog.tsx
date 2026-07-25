import { AlertTriangle, Ban, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { PurchaseOrder } from "./types";

const deliveryDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});

export function CancelOrderDialog({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: PurchaseOrder;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = reason.trim();
    if (normalized.length < 3) {
      setError("Укажите причину отмены");
      return;
    }
    setError("");
    await onConfirm(normalized);
  }

  return (
    <div className="drawer-layer cancel-dialog-layer" role="presentation">
      <button
        aria-label="Закрыть отмену заявки"
        className="drawer-backdrop"
        disabled={busy}
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="cancel-order-title"
        aria-modal="true"
        className="cancel-dialog"
        role="dialog"
      >
        <header>
          <div>
            <span>Отмена заявки</span>
            <h2 id="cancel-order-title">{order.number}</h2>
          </div>
          <button
            aria-label="Закрыть"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            title="Закрыть"
            type="button"
          >
            <X size={19} />
          </button>
        </header>

        <form onSubmit={submit}>
          <div className="cancel-order-context">
            <AlertTriangle size={19} />
            <span>
              {order.supplier.name}
              <strong>
                {order.items.length} поз. ·{" "}
                {deliveryDate.format(new Date(order.delivery_date))}
              </strong>
            </span>
          </div>

          <label className="field">
            <span>Причина отмены</span>
            <textarea
              autoFocus
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Например, поставщик не подтвердил наличие"
              required
              rows={4}
              value={reason}
            />
          </label>

          {error && (
            <div className="form-error" role="alert">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          <footer>
            <button
              className="quiet-button"
              disabled={busy}
              onClick={onClose}
              type="button"
            >
              Оставить заявку
            </button>
            <button className="danger-button" disabled={busy} type="submit">
              <Ban size={17} />
              {busy ? "Отменяем..." : "Отменить заявку"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
