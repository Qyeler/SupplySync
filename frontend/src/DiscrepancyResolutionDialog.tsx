import {
  AlertTriangle,
  CircleCheckBig,
  RotateCcw,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import type { PurchaseOrder } from "./types";

export function DiscrepancyResolutionDialog({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: PurchaseOrder;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const reopening = Boolean(order.receipt?.is_resolved);
  const discrepancyCount = order.receipt?.discrepancy_count ?? 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = note.trim();
    if (normalized.length < 3) {
      setError(
        reopening
          ? "Укажите причину повторного открытия"
          : "Опишите, как урегулировано расхождение",
      );
      return;
    }
    setError("");
    await onConfirm(normalized);
  }

  return (
    <div className="drawer-layer cancel-dialog-layer" role="presentation">
      <button
        aria-label="Закрыть урегулирование расхождений"
        className="drawer-backdrop"
        disabled={busy}
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="resolution-title"
        aria-modal="true"
        className="cancel-dialog resolution-dialog"
        role="dialog"
      >
        <header>
          <div>
            <span>{reopening ? "Повторная сверка" : "Урегулирование"}</span>
            <h2 id="resolution-title">{order.number}</h2>
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
          <div className="resolution-context">
            {reopening ? <RotateCcw size={19} /> : <CircleCheckBig size={19} />}
            <span>
              {order.supplier.name}
              <strong>
                {discrepancyCount} расхожд. ·{" "}
                {reopening ? "сейчас закрыто" : "требует решения"}
              </strong>
            </span>
          </div>

          <label className="field">
            <span>
              {reopening ? "Причина повторного открытия" : "Результат сверки"}
            </span>
            <textarea
              autoFocus
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                reopening
                  ? "Например, поставщик не подтвердил корректировку"
                  : "Например, поставщик оформил корректировочный документ"
              }
              required
              rows={4}
              value={note}
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
              Оставить без изменений
            </button>
            <button
              className={reopening ? "secondary-button" : "primary-button"}
              disabled={busy}
              type="submit"
            >
              {reopening ? <RotateCcw size={17} /> : <CircleCheckBig size={17} />}
              {busy
                ? "Сохраняем..."
                : reopening
                  ? "Открыть повторно"
                  : "Урегулировать"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
