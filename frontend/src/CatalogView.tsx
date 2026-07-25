import {
  AlertTriangle,
  Archive,
  ChevronDown,
  Layers3,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type {
  Product,
  ProductDraft,
  Supplier,
  SupplierOfferDraft,
} from "./types";

type AvailabilityFilter = "active" | "archived" | "all";

const currency = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

function activeOffers(product: Product) {
  return product.offers.filter((offer) => offer.supplier.is_active);
}

function priceRange(product: Product): string {
  const prices = activeOffers(product).map((offer) => Number(offer.unit_price));
  if (prices.length === 0) return "Нет цены";
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  return minimum === maximum
    ? currency.format(minimum)
    : `${currency.format(minimum)} – ${currency.format(maximum)}`;
}

function supplierCountLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} поставщиков`;
  if (last === 1) return `${count} поставщик`;
  if (last >= 2 && last <= 4) return `${count} поставщика`;
  return `${count} поставщиков`;
}

export function CatalogView({
  products,
  search,
  onEdit,
  onToggleActive,
  busyId,
}: {
  products: Product[];
  search: string;
  onEdit: (product: Product) => void;
  onToggleActive: (product: Product) => Promise<void>;
  busyId: number | null;
}) {
  const [availability, setAvailability] =
    useState<AvailabilityFilter>("active");
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return products.filter((product) => {
      const matchesAvailability =
        availability === "all" ||
        (availability === "active" && product.is_active) ||
        (availability === "archived" && !product.is_active);
      const matchesSearch =
        !query ||
        [
          product.sku,
          product.name,
          product.category,
          ...product.offers.map((offer) => offer.supplier.name),
        ]
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes(query);
      return matchesAvailability && matchesSearch;
    });
  }, [availability, products, search]);

  const activeProducts = products.filter((product) => product.is_active);
  const archivedCount = products.length - activeProducts.length;
  const categoryCount = new Set(
    activeProducts.map((product) => product.category),
  ).size;
  const multiSourceCount = activeProducts.filter(
    (product) => activeOffers(product).length > 1,
  ).length;
  const offerCount = activeProducts.reduce(
    (total, product) => total + activeOffers(product).length,
    0,
  );

  return (
    <section className="directory-view">
      <div className="directory-metrics" aria-label="Сводка каталога">
        <div className="directory-metric metric-cobalt">
          <Tags size={18} />
          <span>
            Позиций
            <strong>{activeProducts.length}</strong>
          </span>
        </div>
        <div className="directory-metric metric-amber">
          <Layers3 size={18} />
          <span>
            Категорий
            <strong>{categoryCount}</strong>
          </span>
        </div>
        <div className="directory-metric metric-teal">
          <PackagePlus size={18} />
          <span>
            Предложений
            <strong>{offerCount}</strong>
          </span>
        </div>
        <div className="directory-coverage">
          <span>Альтернативный источник</span>
          <strong>
            {multiSourceCount} из {activeProducts.length}
          </strong>
          <div className="coverage-track">
            <span
              style={{
                width: `${activeProducts.length ? (multiSourceCount / activeProducts.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      <header className="orders-heading catalog-heading">
        <div>
          <h2>Номенклатура</h2>
          <span>{filteredProducts.length} в выборке</span>
        </div>
        <div
          aria-label="Доступность продуктов"
          className="catalog-availability"
          role="group"
        >
          <button
            className={availability === "active" ? "is-active" : ""}
            onClick={() => setAvailability("active")}
            type="button"
          >
            Активные <strong>{activeProducts.length}</strong>
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
            Все <strong>{products.length}</strong>
          </button>
        </div>
      </header>

      {filteredProducts.length === 0 ? (
        <div className="state-panel">
          <Tags size={22} />
          <div>
            <strong>Продукты не найдены</strong>
            <span>Измените запрос или добавьте новую позицию.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="directory-table-wrap">
            <table className="directory-table catalog-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Продукт</th>
                  <th>Категория</th>
                  <th>Поставщики</th>
                  <th>Цена за единицу</th>
                  <th>Мин. заказ</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const currentOffers = activeOffers(product);
                  const preferred =
                    currentOffers.find((offer) => offer.is_preferred) ??
                    currentOffers[0];
                  return (
                    <tr
                      className={!product.is_active ? "is-archived" : undefined}
                      key={product.id}
                    >
                      <td>
                        <span className="sku-code">{product.sku}</span>
                        {!product.is_active && (
                          <span className="product-state">Архив</span>
                        )}
                      </td>
                      <td>
                        <strong>{product.name}</strong>
                        <span className="cell-secondary">
                          Единица: {product.unit}
                        </span>
                      </td>
                      <td>
                        <span className="category-label">{product.category}</span>
                      </td>
                      <td>
                        <div className="supplier-stack">
                          {currentOffers.slice(0, 2).map((offer) => (
                            <span
                              className={
                                offer.is_preferred ? "is-preferred" : undefined
                              }
                              key={offer.supplier_id}
                            >
                              {offer.supplier.name}
                            </span>
                          ))}
                          {currentOffers.length === 0 && (
                            <span>Нет активных источников</span>
                          )}
                          {currentOffers.length > 2 && (
                            <span>+{currentOffers.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <strong className="mono-value">{priceRange(product)}</strong>
                      </td>
                      <td>
                        <span className="mono-value">
                          {preferred?.minimum_order ?? "—"} {product.unit}
                        </span>
                      </td>
                      <td className="catalog-action-cell">
                        <div className="catalog-row-actions">
                          <button
                            aria-label={`Редактировать предложения ${product.name}`}
                            className="icon-button table-icon-button"
                            disabled={busyId === product.id}
                            onClick={() => onEdit(product)}
                            title="Редактировать предложения"
                            type="button"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            aria-label={
                              product.is_active
                                ? `Архивировать ${product.name}`
                                : `Восстановить ${product.name}`
                            }
                            className="icon-button table-icon-button product-archive-button"
                            disabled={busyId === product.id}
                            onClick={() => void onToggleActive(product)}
                            title={
                              product.is_active
                                ? "Переместить в архив"
                                : "Восстановить в каталоге"
                            }
                            type="button"
                          >
                            {busyId === product.id ? (
                              <RefreshCw className="spin" size={16} />
                            ) : product.is_active ? (
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
            {filteredProducts.map((product) => (
              <article
                className={`directory-mobile-row ${
                  product.is_active ? "" : "is-archived"
                }`}
                key={product.id}
              >
                <header>
                  <div>
                    <span className="sku-code">{product.sku}</span>
                    <strong>{product.name}</strong>
                  </div>
                  <span
                    className={
                      product.is_active ? "category-label" : "product-state"
                    }
                  >
                    {product.is_active ? product.category : "Архив"}
                  </span>
                </header>
                <div className="mobile-directory-facts">
                  <span>
                    Поставщики
                    <strong>{activeOffers(product).length}</strong>
                  </span>
                  <span>
                    Цена
                    <strong>{priceRange(product)}</strong>
                  </span>
                  <span>
                    Единица
                    <strong>{product.unit}</strong>
                  </span>
                </div>
                <div className="catalog-mobile-actions">
                  <button
                    aria-label={`Настроить предложения ${product.name}`}
                    className="mobile-edit-button"
                    disabled={busyId === product.id}
                    onClick={() => onEdit(product)}
                    type="button"
                  >
                    <Pencil size={15} />
                    Предложения
                  </button>
                  <button
                    aria-label={
                      product.is_active
                        ? `Архивировать ${product.name}`
                        : `Восстановить ${product.name}`
                    }
                    className="mobile-edit-button product-mobile-archive"
                    disabled={busyId === product.id}
                    onClick={() => void onToggleActive(product)}
                    type="button"
                  >
                    {busyId === product.id ? (
                      <RefreshCw className="spin" size={15} />
                    ) : product.is_active ? (
                      <Archive size={15} />
                    ) : (
                      <RotateCcw size={15} />
                    )}
                    {product.is_active ? "В архив" : "Восстановить"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function blankOffer(suppliers: Supplier[], usedIds: number[]): SupplierOfferDraft {
  const supplier =
    suppliers.find((item) => !usedIds.includes(item.id)) ?? suppliers[0];
  return {
    supplier_id: supplier?.id ?? 0,
    supplier_sku: "",
    unit_price: 0,
    minimum_order: 1,
    is_preferred: usedIds.length === 0,
  };
}

export function ProductDrawer({
  suppliers,
  busy,
  onClose,
  onSave,
  product,
}: {
  suppliers: Supplier[];
  busy: boolean;
  onClose: () => void;
  onSave: (draft: ProductDraft) => Promise<void>;
  product?: Product | null;
}) {
  const editing = product != null;
  const activeSuppliers = suppliers.filter((supplier) => supplier.is_active);
  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(
    product?.category ?? "Овощи и зелень",
  );
  const [unit, setUnit] = useState(product?.unit ?? "кг");
  const [offers, setOffers] = useState<SupplierOfferDraft[]>([
    ...(product?.offers.map((offer) => ({
      supplier_id: offer.supplier_id,
      supplier_sku: offer.supplier_sku,
      unit_price: Number(offer.unit_price),
      minimum_order: Number(offer.minimum_order),
      is_preferred: offer.is_preferred,
    })) ?? [blankOffer(activeSuppliers, [])]),
  ]);
  const [error, setError] = useState("");

  function updateOffer(index: number, patch: Partial<SupplierOfferDraft>) {
    setOffers((current) =>
      current.map((offer, offerIndex) =>
        offerIndex === index ? { ...offer, ...patch } : offer,
      ),
    );
  }

  function setPreferred(index: number, preferred: boolean) {
    setOffers((current) =>
      current.map((offer, offerIndex) => ({
        ...offer,
        is_preferred: preferred ? offerIndex === index : false,
      })),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offers.some((offer) => offer.supplier_id <= 0)) {
      setError("Сначала добавьте активного поставщика");
      return;
    }
    if (offers.some((offer) => offer.unit_price <= 0)) {
      setError("Укажите цену каждого предложения");
      return;
    }
    setError("");
    await onSave({ sku, name, category, unit, offers });
  }

  return (
    <div className="drawer-layer" role="presentation">
      <button
        aria-label="Закрыть форму продукта"
        className="drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="product-drawer-title"
        aria-modal="true"
        className="order-drawer"
        role="dialog"
      >
        <header className="drawer-header">
          <div>
            <span className="drawer-kicker">Каталог</span>
            <h2 id="product-drawer-title">
              {editing ? `Настроить ${product?.sku}` : "Добавить продукт"}
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

        <form className="order-form" onSubmit={submit}>
          <div className="form-grid product-form-grid">
            <label className="field">
              <span>SKU</span>
              <input
                maxLength={80}
                onChange={(event) => setSku(event.target.value.toUpperCase())}
                placeholder="VEG-CUC-M"
                required
                value={sku}
              />
            </label>
            <label className="field">
              <span>Название</span>
              <input
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
                placeholder="Огурцы среднеплодные"
                required
                value={name}
              />
            </label>
            <label className="field">
              <span>Категория</span>
              <input
                list="product-categories"
                onChange={(event) => setCategory(event.target.value)}
                required
                value={category}
              />
              <datalist id="product-categories">
                <option value="Овощи и зелень" />
                <option value="Молочные продукты" />
                <option value="Рыба и морепродукты" />
                <option value="Напитки" />
                <option value="Бакалея" />
              </datalist>
            </label>
            <label className="field">
              <span>Единица</span>
              <span className="select-wrap">
                <select
                  onChange={(event) => setUnit(event.target.value)}
                  value={unit}
                >
                  <option value="кг">кг</option>
                  <option value="л">л</option>
                  <option value="шт.">шт.</option>
                  <option value="уп.">уп.</option>
                  <option value="бут.">бут.</option>
                  <option value="кор.">кор.</option>
                </select>
                <ChevronDown size={16} />
              </span>
            </label>
          </div>

          <div className="line-items-heading">
            <div>
              <h3>Предложения</h3>
              <span>{supplierCountLabel(offers.length)}</span>
            </div>
            <button
              className="quiet-button"
              disabled={activeSuppliers.every((supplier) =>
                offers.some((offer) => offer.supplier_id === supplier.id),
              )}
              onClick={() =>
                setOffers((current) => [
                  ...current,
                  blankOffer(
                    activeSuppliers,
                    current.map((offer) => offer.supplier_id),
                  ),
                ])
              }
              type="button"
            >
              <Plus size={16} />
              Добавить
            </button>
          </div>

          <div className="offer-list">
            {offers.map((offer, index) => (
              <div className="offer-row" key={index}>
                <label className="field offer-supplier">
                  <span>Поставщик</span>
                  <select
                    onChange={(event) =>
                      updateOffer(index, {
                        supplier_id: Number(event.target.value),
                      })
                    }
                    value={offer.supplier_id}
                  >
                    {suppliers.map((supplier) => (
                      <option
                        disabled={offers.some(
                          (item, itemIndex) =>
                            itemIndex !== index &&
                            item.supplier_id === supplier.id,
                        ) || !supplier.is_active}
                        key={supplier.id}
                        value={supplier.id}
                      >
                        {supplier.name}
                        {supplier.is_active ? "" : " · архив"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Код поставщика</span>
                  <input
                    onChange={(event) =>
                      updateOffer(index, { supplier_sku: event.target.value })
                    }
                    placeholder="Код в прайсе"
                    value={offer.supplier_sku}
                  />
                </label>
                <label className="field">
                  <span>Цена, ₽</span>
                  <input
                    min="0.01"
                    onChange={(event) =>
                      updateOffer(index, {
                        unit_price: Number(event.target.value),
                      })
                    }
                    required
                    step="0.01"
                    type="number"
                    value={offer.unit_price}
                  />
                </label>
                <label className="field">
                  <span>Мин. заказ</span>
                  <input
                    min="0.001"
                    onChange={(event) =>
                      updateOffer(index, {
                        minimum_order: Number(event.target.value),
                      })
                    }
                    required
                    step="0.001"
                    type="number"
                    value={offer.minimum_order}
                  />
                </label>
                <label className="check-control">
                  <input
                    checked={offer.is_preferred}
                    onChange={(event) =>
                      setPreferred(index, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>Основной</span>
                </label>
                <button
                  aria-label={`Удалить предложение ${index + 1}`}
                  className="remove-item"
                  disabled={offers.length === 1}
                  onClick={() =>
                    setOffers((current) =>
                      current.filter((_, offerIndex) => offerIndex !== index),
                    )
                  }
                  title="Удалить предложение"
                  type="button"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>

          {error && (
            <div className="form-error" role="alert">
              <AlertTriangle size={17} />
              {error}
            </div>
          )}

          <footer className="drawer-footer">
            <div className="order-total">
              <span>Источников цены</span>
              <strong>{offers.length}</strong>
            </div>
            <button className="primary-button" disabled={busy} type="submit">
              {editing ? <Save size={18} /> : <PackagePlus size={18} />}
              {busy
                ? "Сохраняем..."
                : editing
                  ? "Сохранить изменения"
                  : "Добавить продукт"}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
