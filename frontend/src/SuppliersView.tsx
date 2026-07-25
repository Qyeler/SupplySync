import {
  AlertTriangle,
  Archive,
  Building2,
  Clock3,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type {
  Product,
  PurchaseOrder,
  Supplier,
  SupplierDraft,
} from "./types";

type AvailabilityFilter = "active" | "archived" | "all";

const currency = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export function SuppliersView({
  suppliers,
  products,
  orders,
  search,
  onEdit,
  onToggleActive,
  busyId,
}: {
  suppliers: Supplier[];
  products: Product[];
  orders: PurchaseOrder[];
  search: string;
  onEdit: (supplier: Supplier) => void;
  onToggleActive: (supplier: Supplier) => Promise<void>;
  busyId: number | null;
}) {
  const [availability, setAvailability] =
    useState<AvailabilityFilter>("active");
  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return suppliers.filter((supplier) => {
      const matchesAvailability =
        availability === "all" ||
        (availability === "active" && supplier.is_active) ||
        (availability === "archived" && !supplier.is_active);
      const matchesSearch =
        !query ||
        [supplier.name, supplier.contact_name, supplier.phone]
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes(query);
      return matchesAvailability && matchesSearch;
    });
  }, [availability, search, suppliers]);

  function factsFor(supplierId: number) {
    const supplierOrders = orders.filter(
      (order) =>
        order.supplier.id === supplierId &&
        !["delivered", "cancelled"].includes(order.status),
    );
    const assortment = products.filter(
      (product) =>
        product.is_active &&
        product.offers.some((offer) => offer.supplier_id === supplierId),
    ).length;
    return {
      activeOrders: supplierOrders.length,
      assortment,
      openAmount: supplierOrders.reduce(
        (total, order) => total + Number(order.total),
        0,
      ),
    };
  }

  const activeSuppliers = suppliers.filter((supplier) => supplier.is_active);
  const archivedCount = suppliers.length - activeSuppliers.length;
  const activeSupplierIds = new Set(
    activeSuppliers.map((supplier) => supplier.id),
  );
  const averageLeadTime = activeSuppliers.length
    ? activeSuppliers.reduce(
        (total, supplier) => total + supplier.lead_time_days,
        0,
      ) / activeSuppliers.length
    : 0;

  return (
    <section className="directory-view">
      <div className="directory-metrics suppliers-metrics" aria-label="Сводка поставщиков">
        <div className="directory-metric metric-teal">
          <Building2 size={18} />
          <span>
            Поставщиков
            <strong>{activeSuppliers.length}</strong>
          </span>
        </div>
        <div className="directory-metric metric-amber">
          <Clock3 size={18} />
          <span>
            Средний срок
            <strong>{averageLeadTime.toFixed(1)} дн.</strong>
          </span>
        </div>
        <div className="directory-metric metric-cobalt">
          <PackageOpen size={18} />
          <span>
            Покрытие
            <strong>
              {products.reduce(
                (total, product) =>
                  total +
                    (product.is_active
                      ? product.offers.filter((offer) =>
                          activeSupplierIds.has(offer.supplier_id),
                        ).length
                      : 0),
                0,
              )}{" "}
              связей
            </strong>
          </span>
        </div>
      </div>

      <header className="orders-heading catalog-heading">
        <div>
          <h2>Партнёры по поставкам</h2>
          <span>{filteredSuppliers.length} в выборке</span>
        </div>
        <div
          aria-label="Доступность поставщиков"
          className="catalog-availability"
          role="group"
        >
          <button
            className={availability === "active" ? "is-active" : ""}
            onClick={() => setAvailability("active")}
            type="button"
          >
            Активные <strong>{activeSuppliers.length}</strong>
          </button>
          <button
            className={availability === "archived" ? "is-active" : ""}
            onClick={() => setAvailability("archived")}
            type="button"
          >
            Архив <strong>{archivedCount}</strong>
          </button>
          <button
            className={availability === "all" ? "is-active" : ""}
            onClick={() => setAvailability("all")}
            type="button"
          >
            Все <strong>{suppliers.length}</strong>
          </button>
        </div>
      </header>

      {filteredSuppliers.length === 0 ? (
        <div className="state-panel">
          <Building2 size={22} />
          <div>
            <strong>Поставщики не найдены</strong>
            <span>Измените запрос или добавьте нового партнёра.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="directory-table-wrap">
            <table className="directory-table suppliers-table">
              <thead>
                <tr>
                  <th>Поставщик</th>
                  <th>Контакт</th>
                  <th>Срок</th>
                  <th>Ассортимент</th>
                  <th>Активные заявки</th>
                  <th>В работе</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => {
                  const facts = factsFor(supplier.id);
                  return (
                    <tr
                      className={!supplier.is_active ? "is-archived" : undefined}
                      key={supplier.id}
                    >
                      <td>
                        <strong>{supplier.name}</strong>
                        <span className="cell-secondary">
                          ID {String(supplier.id).padStart(4, "0")}
                        </span>
                        {!supplier.is_active && (
                          <span className="product-state">Архив</span>
                        )}
                      </td>
                      <td>
                        <strong>{supplier.contact_name}</strong>
                        <span className="cell-secondary">{supplier.phone}</span>
                      </td>
                      <td>
                        <span className="lead-time">
                          {supplier.lead_time_days} дн.
                        </span>
                      </td>
                      <td>
                        <strong className="mono-value">{facts.assortment}</strong>
                        <span className="cell-secondary">позиций</span>
                      </td>
                      <td>
                        <strong className="mono-value">
                          {facts.activeOrders}
                        </strong>
                      </td>
                      <td>
                        <strong className="mono-value">
                          {currency.format(facts.openAmount)}
                        </strong>
                      </td>
                      <td className="catalog-action-cell">
                        <div className="catalog-row-actions">
                          <button
                            aria-label={`Редактировать поставщика ${supplier.name}`}
                            className="icon-button table-icon-button"
                            disabled={busyId === supplier.id}
                            onClick={() => onEdit(supplier)}
                            title="Редактировать поставщика"
                            type="button"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            aria-label={
                              supplier.is_active
                                ? `Архивировать ${supplier.name}`
                                : `Восстановить ${supplier.name}`
                            }
                            className="icon-button table-icon-button product-archive-button"
                            disabled={busyId === supplier.id}
                            onClick={() => void onToggleActive(supplier)}
                            title={
                              supplier.is_active
                                ? "Переместить в архив"
                                : "Восстановить поставщика"
                            }
                            type="button"
                          >
                            {busyId === supplier.id ? (
                              <RefreshCw className="spin" size={16} />
                            ) : supplier.is_active ? (
                              <Archive size={16} />
                            ) : (
                              <RotateCcw size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="directory-mobile">
            {filteredSuppliers.map((supplier) => {
              const facts = factsFor(supplier.id);
              return (
                <article
                  className={`directory-mobile-row ${
                    supplier.is_active ? "" : "is-archived"
                  }`}
                  key={supplier.id}
                >
                  <header>
                    <div>
                      <span
                        className={
                          supplier.is_active ? "sku-code" : "product-state"
                        }
                      >
                        {supplier.is_active
                          ? `${supplier.lead_time_days} дн. до поставки`
                          : "Архив"}
                      </span>
                      <strong>{supplier.name}</strong>
                    </div>
                    <span className="supplier-avatar">
                      {supplier.name.slice(0, 2).toUpperCase()}
                    </span>
                  </header>
                  <span className="supplier-mobile-contact">
                    {supplier.contact_name} · {supplier.phone}
                  </span>
                  <div className="mobile-directory-facts">
                    <span>
                      Ассортимент
                      <strong>{facts.assortment}</strong>
                    </span>
                    <span>
                      Заявки
                      <strong>{facts.activeOrders}</strong>
                    </span>
                    <span>
                      В работе
                      <strong>{currency.format(facts.openAmount)}</strong>
                    </span>
                  </div>
                  <div className="catalog-mobile-actions">
                    <button
                      aria-label={`Редактировать поставщика ${supplier.name}`}
                      className="mobile-edit-button"
                      disabled={busyId === supplier.id}
                      onClick={() => onEdit(supplier)}
                      type="button"
                    >
                      <Pencil size={15} />
                      Редактировать
                    </button>
                    <button
                      aria-label={
                        supplier.is_active
                          ? `Архивировать ${supplier.name}`
                          : `Восстановить ${supplier.name}`
                      }
                      className="mobile-edit-button product-mobile-archive"
                      disabled={busyId === supplier.id}
                      onClick={() => void onToggleActive(supplier)}
                      type="button"
                    >
                      {busyId === supplier.id ? (
                        <RefreshCw className="spin" size={15} />
                      ) : supplier.is_active ? (
                        <Archive size={15} />
                      ) : (
                        <RotateCcw size={15} />
                      )}
                      {supplier.is_active ? "В архив" : "Восстановить"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export function SupplierDrawer({
  busy,
  onClose,
  onSave,
  supplier,
}: {
  busy: boolean;
  onClose: () => void;
  onSave: (draft: SupplierDraft) => Promise<void>;
  supplier?: Supplier | null;
}) {
  const editing = supplier != null;
  const [name, setName] = useState(supplier?.name ?? "");
  const [contactName, setContactName] = useState(
    supplier?.contact_name ?? "",
  );
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [leadTime, setLeadTime] = useState(supplier?.lead_time_days ?? 2);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (leadTime < 0) {
      setError("Срок поставки не может быть отрицательным");
      return;
    }
    setError("");
    await onSave({
      name,
      contact_name: contactName,
      phone,
      lead_time_days: leadTime,
    });
  }

  return (
    <div className="drawer-layer" role="presentation">
      <button
        aria-label="Закрыть форму поставщика"
        className="drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="supplier-drawer-title"
        aria-modal="true"
        className="order-drawer compact-drawer"
        role="dialog"
      >
        <header className="drawer-header">
          <div>
            <span className="drawer-kicker">
              {editing ? `Поставщик ID ${String(supplier.id).padStart(4, "0")}` : "Поставщики"}
            </span>
            <h2 id="supplier-drawer-title">
              {editing ? "Изменить карточку" : "Добавить партнёра"}
            </h2>
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

        <form className="order-form supplier-form" onSubmit={submit}>
          <label className="field field-wide">
            <span>Компания</span>
            <input
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
              placeholder="Название поставщика"
              required
              value={name}
            />
          </label>
          <label className="field field-wide">
            <span>Контактное лицо</span>
            <input
              maxLength={160}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Имя и фамилия"
              required
              value={contactName}
            />
          </label>
          <label className="field field-wide">
            <span>Телефон</span>
            <input
              maxLength={40}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+7 391 000-00-00"
              required
              type="tel"
              value={phone}
            />
          </label>
          <label className="field field-wide">
            <span>Стандартный срок поставки, дней</span>
            <input
              max="365"
              min="0"
              onChange={(event) => setLeadTime(Number(event.target.value))}
              required
              type="number"
              value={leadTime}
            />
          </label>

          {error && (
            <div className="form-error" role="alert">
              <AlertTriangle size={17} />
              {error}
            </div>
          )}

          <footer className="drawer-footer">
            <div className="order-total">
              <span>Стандартный срок</span>
              <strong>{leadTime} дн.</strong>
            </div>
            <button className="primary-button" disabled={busy} type="submit">
              {editing ? <Save size={18} /> : <Plus size={18} />}
              {busy
                ? "Сохраняем..."
                : editing
                  ? "Сохранить изменения"
                  : "Добавить поставщика"}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
