import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheckBig,
  ClipboardCheck,
  ClipboardList,
  CopyPlus,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  Truck,
  Wifi,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { CancelOrderDialog } from "./CancelOrderDialog";
import { CatalogView, ProductDrawer } from "./CatalogView";
import { DiscrepancyResolutionDialog } from "./DiscrepancyResolutionDialog";
import { OrderDetailsDrawer } from "./OrderDetailsDrawer";
import { ReceiptDrawer } from "./ReceiptDrawer";
import { SupplierDrawer, SuppliersView } from "./SuppliersView";
import type {
  OrderDraft,
  OrderItemDraft,
  OrderStatus,
  Product,
  ProductDraft,
  PurchaseOrder,
  ReceiptDraft,
  Supplier,
  SupplierDraft,
} from "./types";

type StatusFilter = "all" | OrderStatus;
type OrderFocus = "none" | "today" | "overdue" | "discrepancy";
type ViewMode = "orders" | "catalog" | "suppliers";

const ORDER_FOCUS_LABELS: Record<Exclude<OrderFocus, "none">, string> = {
  today: "–ü–æ—Å—Ç–∞–≤–∫–∏ —Å–µ–≥–æ–¥–Ω—è",
  overdue: "–ü—Ä–æ—Å—Ä–æ—á–µ–Ω–Ω—ã–µ –ø–æ—Å—Ç–∞–≤–∫–∏",
  discrepancy: "–†–∞—Å—Ö–æ–∂–¥–µ–Ω–∏—è –ø—Ä–∏ –ø—Ä–∏—ë–º–∫–µ",
};

const STATUS_FLOW: OrderStatus[] = [
  "draft",
  "sent",
  "confirmed",
  "delivered",
];

const STATUS_META: Record<
  OrderStatus,
  { label: string; short: string; icon: typeof ClipboardList }
> = {
  draft: { label: "–ß–µ—Ä–Ω–æ–≤–∏–∫", short: "–ß–µ—Ä–Ω–æ–≤–∏–∫–∏", icon: ClipboardList },
  sent: { label: "–û—Ç–ø—Ä–∞–≤–ª–µ–Ω–∞", short: "–û—Ç–ø—Ä–∞–≤–ª–µ–Ω—ã", icon: Send },
  confirmed: { label: "–ü–æ–¥—Ç–≤–µ—Ä–∂–¥–µ–Ω–∞", short: "–ü–æ–¥—Ç–≤–µ—Ä–∂–¥–µ–Ω—ã", icon: Check },
  delivered: { label: "–î–æ—Å—Ç–∞–≤–ª–µ–Ω–∞", short: "–î–æ—Å—Ç–∞–≤–ª–µ–Ω—ã", icon: Truck },
  cancelled: { label: "–û—Ç–º–µ–Ω–µ–Ω–∞", short: "–û—Ç–º–µ–Ω–µ–Ω—ã", icon: X },
};

const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["confirmed", "cancelled"],
  confirmed: ["cancelled"],
  delivered: [],
  cancelled: [],
};

const currency = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const shortDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
});

function sortOrders(orders: PurchaseOrder[]): PurchaseOrder[] {
  return [...orders].sort(
    (left, right) =>
      left.delivery_date.localeCompare(right.delivery_date) ||
      right.id - left.id,
  );
}

function dateInputFromOffset(days: number): string {
  const result = new Date();
  result.setDate(result.getDate() + days);
  const offset = result.getTimezoneOffset();
  return new Date(result.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 10);
}

function formatDelivery(date: string): {
  label: string;
  urgency: "normal" | "today" | "overdue";
} {
  const today = dateInputFromOffset(0);
  if (date === today) return { label: "–°–µ–≥–æ–¥–Ω—è", urgency: "today" };
  if (date < today) return { label: shortDate.format(new Date(date)), urgency: "overdue" };
  return { label: shortDate.format(new Date(date)), urgency: "normal" };
}

function productsForSupplier(
  products: Product[],
  supplierId: number,
): Product[] {
  return products.filter(
    (product) =>
      product.is_active &&
      product.offers.some((offer) => offer.supplier_id === supplierId),
  );
}

function offerFor(
  product: Product | undefined,
  supplierId: number,
) {
  return product?.offers.find((offer) => offer.supplier_id === supplierId);
}

function blankItem(
  products: Product[],
  supplierId: number,
  usedIds: number[] = [],
): OrderItemDraft {
  const product = productsForSupplier(products, supplierId).find(
    (item) => !usedIds.includes(item.id),
  );
  const offer = offerFor(product, supplierId);
  return {
    product_id: product?.id ?? 0,
    quantity: Number(offer?.minimum_order ?? 1),
  };
}

function pluralize(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function StatusRail({
  orders,
  active,
  onChange,
}: {
  orders: PurchaseOrder[];
  active: StatusFilter | null;
  onChange: (status: StatusFilter) => void;
}) {
  const activeOrders = orders.filter((order) => order.status !== "cancelled");
  const cancelledCount = orders.filter(
    (order) => order.status === "cancelled",
  ).length;

  return (
    <section className="status-rail" aria-label="–ú–∞—Ä—à—Ä—É—Ç –∑–∞—è–≤–æ–∫">
      <button
        className={`rail-intro ${active === "all" ? "is-active" : ""}`}
        onClick={() => onChange("all")}
        type="button"
      >
        <span>–í–µ—Å—å –ø–æ—Ç–æ–∫</span>
        <strong>{activeOrders.length}</strong>
      </button>

      <div className="rail-track">
        {STATUS_FLOW.map((status, index) => {
          const meta = STATUS_META[status];
          const count = orders.filter((order) => order.status === status).length;
          const Icon = meta.icon;
          return (
            <button
              className={`rail-stop status-${status} ${
                active === status ? "is-active" : ""
              }`}
              key={status}
              onClick={() => onChange(status)}
              type="button"
            >
              <span className="rail-node">
                <Icon aria-hidden="true" size={15} strokeWidth={2.2} />
              </span>
              <span className="rail-copy">
                <span>{meta.short}</span>
                <strong>{count}</strong>
              </span>
              {index < STATUS_FLOW.length - 1 && (
                <span className="rail-line" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
      <button
        className={`rail-stop rail-cancelled status-cancelled ${
          active === "cancelled" ? "is-active" : ""
        }`}
        onClick={() => onChange("cancelled")}
        type="button"
      >
        <span className="rail-node">
          <X aria-hidden="true" size={15} strokeWidth={2.2} />
        </span>
        <span className="rail-copy">
          <span>–û—Ç–º–µ–Ω–µ–Ω—ã</span>
          <strong>{cancelledCount}</strong>
        </span>
      </button>
    </section>
  );
}

function OrderStatusControl({
  order,
  busy,
  onEdit,
  onStatus,
  onReceipt,
}: {
  order: PurchaseOrder;
  busy: boolean;
  onEdit: (order: PurchaseOrder) => void;
  onStatus: (order: PurchaseOrder, status: OrderStatus) => void;
  onReceipt: (order: PurchaseOrder) => void;
}) {
  if (order.status === "confirmed") {
    return (
      <div className="status-cell-actions">
        <button
          className="receive-button"
          disabled={busy}
          onClick={() => onReceipt(order)}
          type="button"
        >
          <ClipboardCheck size={15} />
          –ü—Ä–∏—ë–º–∫–∞
        </button>
        <button
          className="cancel-order-button"
          disabled={busy}
          onClick={() => onStatus(order, "cancelled")}
          type="button"
        >
          –û—Ç–º–µ–Ω–∏—Ç—å
        </button>
      </div>
    );
  }

  if (order.status === "delivered" && order.receipt) {
    const hasDiscrepancies = order.receipt.discrepancy_count > 0;
    const hasOpenDiscrepancies =
      hasDiscrepancies && !order.receipt.is_resolved;
    return (
      <button
        aria-label={`–û—Ç–∫—Ä—ã—Ç—å –∞–∫—Ç –ø—Ä–∏—ë–º–∫–∏ ${order.number}`}
        className={`receipt-result-button ${
          hasOpenDiscrepancies
            ? "has-discrepancies"
            : order.receipt.is_resolved
              ? "is-resolved"
              : ""
        }`}
        onClick={() => onReceipt(order)}
        type="button"
      >
        <ClipboardCheck size={15} />
        <span>
          {hasDiscrepancies
            ? order.receipt.is_resolved
              ? "–†–∞—Å—Ö–æ–∂–¥–µ–Ω–∏—è –∑–∞–∫—Ä—ã—Ç—ã"
              : `–†–∞—Å—Ö–æ–∂–¥–µ–Ω–∏–π: ${order.receipt.discrepancy_count}`
            : "–ë–µ–∑ —Ä–∞—Å—Ö–æ–∂–¥–µ–Ω–∏–π"}
        </span>
      </button>
    );
  }

  const options = [order.status, ...NEXT_STATUSES[order.status]];
  const statusControl = (
    <span className={`status-select status-${order.status}`}>
      {busy ? (
        <RefreshCw className="spin" size={15} />
      ) : (
        <span className="status-dot" />
      )}
      <select
        aria-label={`–°—Ç–∞—Ç—É—Å –∑–∞—è–≤–∫–∏ ${order.number}`}
        disabled={busy || options.length === 1}
        onChange={(event) =>
          onStatus(order, event.target.value as OrderStatus)
        }
        value={order.status}
      >
        {options.map((status) => (
          <option key={status} value={status}>
            {STATUS_META[status].label}
          </option>
        ))}
      </select>
      {options.length > 1 && <ChevronDown size={14} />}
    </span>
  );

  if (order.status === "draft") {
    return (
      <div className="draft-status-actions">
        <button
          aria-label={`–†–µ–¥–∞–∫—Ç–∏—Ä–æ–≤–∞—Ç—å –∑–∞—è–≤–∫—É ${order.number}`}
          className="icon-button draft-edit-icon"
          disabled={busy}
          onClick={() => onEdit(order)}
          title="–†–µ–¥–∞–∫—Ç–∏—Ä–æ–≤–∞—Ç—å –∑–∞—è–≤–∫—É"
          type="button"
        >
          <Pencil size={15} />
        </button>
        {statusControl}
      </div>
    );
  }

  return statusControl;
}

function OrderDrawer({
  suppliers,
  products,
  busy,
  onClose,
  onSave,
  order,
  template,
}: {
  suppliers: Supplier[];
  products: Product[];
  busy: boolean;
  onClose: () => void;
  onSave: (draft: OrderDraft) => Promise<void>;
  order?: PurchaseOrder | null;
  template?: PurchaseOrder | null;
}) {
  const editing = order != null;
  const repeating = !editing && template != null;
  const sourceOrder = order ?? template;
  const requestedSupplierId = sourceOrder?.supplier.id;
  const sourceSupplierAvailable = suppliers.some(
    (supplier) => supplier.id === requestedSupplierId,
  );
  const initialSupplierId =
    (sourceSupplierAvailable ? requestedSupplierId : suppliers[0]?.id) ?? 0;
  const initialSupplier = suppliers.find(
    (supplier) => supplier.id === initialSupplierId,
  );
  const earliestInitialDate = dateInputFromOffset(
    initialSupplier?.lead_time_days ?? 0,
  );
  const initialAvailableProductIds = new Set(
    productsForSupplier(products, initialSupplierId).map(
      (product) => product.id,
    ),
  );
  const sourceItems =
    sourceOrder?.items.flatMap((item) =>
      (!repeating || sourceSupplierAvailable) &&
      item.product_id != null &&
      initialAvailableProductIds.has(item.product_id)
        ? [
            {
              product_id: item.product_id,
              quantity: Number(item.quantity),
            },
          ]
        : [],
    ) ?? [];
  const skippedItemCount = repeating
    ? (sourceOrder?.items.length ?? 0) - sourceItems.length
    : 0;
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [deliveryDate, setDeliveryDate] = useState(
    order?.delivery_date && order.delivery_date >= earliestInitialDate
      ? order.delivery_date
      : earliestInitialDate,
  );
  const [note, setNote] = useState(sourceOrder?.note ?? "");
  const [items, setItems] = useState<OrderItemDraft[]>(
    sourceItems.length
      ? sourceItems
      : [blankItem(products, initialSupplierId)],
  );
  const [validationError, setValidationError] = useState("");

  const availableProducts = productsForSupplier(products, supplierId);
  const selectedSupplier = suppliers.find(
    (supplier) => supplier.id === supplierId,
  );
  const minimumDeliveryDate = dateInputFromOffset(
    selectedSupplier?.lead_time_days ?? 0,
  );
  const total = items.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.product_id);
    const offer = offerFor(product, supplierId);
    return sum + Number(item.quantity) * Number(offer?.unit_price ?? 0);
  }, 0);

  function updateItem(index: number, patch: Partial<OrderItemDraft>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId) {
      setValidationError("–í—ã–±–µ—Ä–∏—Ç–µ –ø–æ—Å—Ç–∞–≤—â–∏–∫–∞");
      return;
    }
    if (items.some((item) => item.product_id <= 0)) {
      setValidationError("–í—ã–±–µ—Ä–∏—Ç–µ –ø—Ä–æ–¥—É–∫—Ç –¥–ª—è –∫–∞–∂–¥–æ–π –ø–æ–∑–∏—Ü–∏–∏");
      return;
    }
    if (deliveryDate < minimumDeliveryDate) {
      setValidationError(
        `–î–∞—Ç–∞ –ø–æ—Å—Ç–∞–≤–∫–∏ –¥–æ–ª–∂–Ω–∞ –±—ã—Ç—å –Ω–µ —Ä–∞–Ω—å—à–µ ${minimumDeliveryDate}`,
      );
      return;
    }
    setValidationError("");
    await onSave({
      supplier_id: supplierId,
      delivery_date: deliveryDate,
      note,
      items,
    });
  }

  return (
    <div className="drawer-layer" role="presentation">
      <button
        aria-label="–ó–∞–∫—Ä—ã—Ç—å —Ñ–æ—Ä–º—É"
        className="drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="order-drawer-title"
        aria-modal="true"
        className="order-drawer"
        role="dialog"
      >
        <header className="drawer-header">
          <div>
            <span className="drawer-kicker">
              {editing
                ? `–ß–µ—Ä–Ω–æ–≤–∏–∫ ${order.number}`
                : repeating
                  ? `–ù–∞ –æ—Å–Ω–æ–≤–µ ${sourceOrder?.number}`
                  : "–ù–æ–≤–∞—è –ø–æ—Å—Ç–∞–≤–∫–∞"}
            </span>
            <h2 id="order-drawer-title">
              {editing
                ? "–ò–∑–º–µ–Ω–∏—Ç—å –∑–∞—è–≤–∫—É"
                : repeating
                  ? "–ü–æ–≤—Ç–æ—Ä–∏—Ç—å –∑–∞—è–≤–∫—É"
                  : "–°–æ–±—Ä–∞—Ç—å –∑–∞—è–≤–∫—É"}
            </h2>
          </div>
          <button
            aria-label="–ó–∞–∫—Ä—ã—Ç—å"
            className="icon-button"
            onClick={onClose}
            title="–ó–∞–∫—Ä—ã—Ç—å"
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        <form className="order-form" onSubmit={submit}>
          {repeating && (
            <div
              className={`repeat-order-context ${
                !sourceSupplierAvailable || skippedItemCount
                  ? "has-warning"
                  : ""
              }`}
            >
              <CopyPlus size={19} />
              <span>
                <strong>
                  {sourceSupplierAvailable
                    ? `–°–æ—Å—Ç–∞–≤ –∏–∑ ${sourceOrder?.number}`
                    : "–ò—Å—Ö–æ–¥–Ω—ã–π –ø–æ—Å—Ç–∞–≤—â–∏–∫ –Ω–µ–¥–æ—Å—Ç—É–ø–µ–Ω"}
                </s◊Ntˆ⁄$z{-ÆÈ‹j◊ùÛ‡¢∆Fóc‡¢«7G&ˆÊsÌ	M››ΩR›]MÌ-=˝›≥¬˜7G&ˆÊs‡¢«7„Á∂W'&˜'”¬˜7„‡¢¬ˆFóc‡¢∆'WGFˆ‚6∆74Ê÷S“'VñWB÷'WGFˆ‚"ˆ‰6∆ñ6≥◊≤Çí”‚fˆñB∆ˆDFFÇó“GóS“&'WGFˆ‚#‡¢≈&Vg&W6Ñ7r6ó¶S◊≥g“Û‡¢	˝Ì--Ìç-¿¢¬ˆ'WGFˆ„‡¢¬ˆFóc‡¢í¢fñ«FW&VD˜&FW'2Ê∆VÊwFÇ””“ÚÄ¢∆Fób6∆74Ê÷S“'7FFR◊ÊV¬#‡¢ƒ6∆ó&ˆ&D∆ó7B6ó¶S◊≥#'“Û‡¢∆Fóc‡¢«7G&ˆÊsÌ	"›-Ìí-ΩÌ≠R˝Ì≠˝=-„¬˜7G&ˆÊs‡¢«7„Ì	ç}Õ]›ç-RMçΩÕ-çΩÇÌ}Mù-R}˝-≠2„¬˜7„‡¢¬ˆFóc‡¢¬ˆFóc‡¢í¢Ä¢√‡¢∆Fób6∆74Ê÷S“&˜&FW'2◊F&∆R◊w&#‡¢«F&∆R6∆74Ê÷S“&˜&FW'2◊F&∆R#‡¢«FÜVC‡¢«G#‡¢«FÉÌ	}˝-≠¬˜FÉ‡¢«FÉÌ	˝Ì--ùç£¬˜FÉ‡¢«FÉÌ
Ì-#¬˜FÉ‡¢«FÉÌ	MÌ--≠¬˜FÉ‡¢«FÇ6∆74Ê÷S“&∆ñv‚◊&ñváB#Ì
=ÕÕ¬˜FÉ‡¢«FÉÌ
--=¬˜FÉ‡¢¬˜G#‡¢¬˜FÜVC‡¢«F&ˆGì‡¢∂fñ«FW&VD˜&FW'2Ê÷ÇÜ˜&FW"í”‚∞¢6ˆÁ7BFV∆ófW'í“f˜&÷DFV∆ófW'íÜ˜&FW"ÊFV∆ófW'ïˆFFRì∞¢&WGW&‚Ä¢«G"∂Wì◊∂˜&FW"ÊñG”‡¢«FC‡¢∆'WGFˆ‡¢&ñ÷∆&V√◊∂	Ì-≠Ω-¬}˝-≠2G∂˜&FW"ÊÁV÷&W'÷–¢6∆74Ê÷S“&˜&FW"÷ÁV÷&W"˜&FW"÷ÁV÷&W"÷'WGFˆ‚ ¢ˆ‰6∆ñ6≥◊≤Çí”‚6WDFWFñ«4˜&FW"Ü˜&FW"ó–¢GóS“&'WGFˆ‚ ¢‡¢∂˜&FW"ÊÁV÷&W'–¢¬ˆ'WGFˆ„‡¢«7‚6∆74Ê÷S“&˜&FW"÷7&VFVB#‡¢Ì"∑6Ü˜'DFFRÊf˜&÷BÜÊWrFFRÜ˜&FW"Ê7&VFVEˆBíó–¢¬˜7„‡¢¬˜FC‡¢«FC‡¢«7G&ˆÊr6∆74Ê÷S“'7W∆ñW"÷Ê÷R#‡¢∂˜&FW"Á7W∆ñW"ÊÊ÷W–¢¬˜7G&ˆÊs‡¢«7‚6∆74Ê÷S“'7W∆ñW"÷6ˆÁF7B#‡¢∂˜&FW"Á7W∆ñW"Ê6ˆÁF7EˆÊ÷W–¢¬˜7„‡¢¬˜FC‡¢«FC‡¢«7‚6∆74Ê÷S“&óFV◊2◊7V÷÷'í#‡¢∂˜&FW"ÊóFV◊5≥”ÚÁ&ˆGV7EˆÊ÷W–¢¬˜7„‡¢«7‚6∆74Ê÷S“&óFV◊2÷÷˜&R#‡¢∂˜&FW"ÊóFV◊2Ê∆VÊwFÇ‚¢Ú]ùG∂˜&FW"ÊóFV◊2Ê∆VÊwFÇ“÷ ¢¢G∂˜&FW"ÊóFV◊5≥”ÚÁVÁFóGó“G∂˜&FW"ÊóFV◊5≥”ÚÁVÊóG÷–¢¬˜7„‡¢¬˜FC‡¢«FC‡¢«7‡¢6∆74Ê÷S◊∂FV∆ófW'í÷FFRW&vVÊ7í“G∂FV∆ófW'íÁW&vVÊ7ó÷–¢‡¢∂FV∆ófW'íÊ∆&V«–¢¬˜7„‡¢«7‚6∆74Ê÷S“&FV∆ófW'í◊ñV"#‡¢∂ÊWrFFRÜ˜&FW"ÊFV∆ófW'ïˆFFRíÊvWDgV∆≈ñV"Çó–¢¬˜7„‡¢¬˜FC‡¢«FB6∆74Ê÷S“&∆ñv‚◊&ñváB#‡¢«7G&ˆÊr6∆74Ê÷S“&˜&FW"÷÷˜VÁB#‡¢∂7W'&VÊ7íÊf˜&÷BÑÁV÷&W"Ü˜&FW"ÁF˜F¬íó–¢¬˜7G&ˆÊs‡¢¬˜FC‡¢«FC‡¢ƒ˜&FW%7FGW46ˆÁG&ˆ¿¢'W7ì◊∑WFFñÊtñB””“˜&FW"ÊñG–¢ˆ‰VFóC◊∂˜V‰˜&FW$VFóF˜'–¢ˆÂ&V6VóC◊∑6WE&V6VóD˜&FW'–¢ˆÂ7FGW3◊∑&WVW7E7FGW46ÜÊvW–¢˜&FW#◊∂˜&FW'–¢Û‡¢¬˜FC‡¢¬˜G#‡¢ì∞¢“ó–¢¬˜F&ˆGì‡¢¬˜F&∆S‡¢¬ˆFóc‡†¢∆Fób6∆74Ê÷S“&˜&FW'2÷÷ˆ&ñ∆R#‡¢∂fñ«FW&VD˜&FW'2Ê÷ÇÜ˜&FW"í”‚∞¢6ˆÁ7BFV∆ófW'í“f˜&÷DFV∆ófW'íÜ˜&FW"ÊFV∆ófW'ïˆFFRì∞¢&WGW&‚Ä¢∆'Fñ6∆R6∆74Ê÷S“&˜&FW"÷÷ˆ&ñ∆R◊&˜r"∂Wì◊∂˜&FW"ÊñG”‡¢∆ÜVFW#‡¢∆Fóc‡¢∆'WGFˆ‡¢&ñ÷∆&V√◊∂	Ì-≠Ω-¬}˝-≠2G∂˜&FW"ÊÁV÷&W'÷–¢6∆74Ê÷S“&˜&FW"÷ÁV÷&W"˜&FW"÷ÁV÷&W"÷'WGFˆ‚ ¢ˆ‰6∆ñ6≥◊≤Çí”‚6WDFWFñ«4˜&FW"Ü˜&FW"ó–¢GóS“&'WGFˆ‚ ¢‡¢∂˜&FW"ÊÁV÷&W'–¢¬ˆ'WGFˆ„‡¢«7G&ˆÊsÁ∂˜&FW"Á7W∆ñW"ÊÊ÷W”¬˜7G&ˆÊs‡¢¬ˆFóc‡¢«7‚6∆74Ê÷S◊∂7FGW2◊ñ∆¬7FGW2“G∂˜&FW"Á7FGW7÷”‡¢µ5DEU5Ù‘UD∂˜&FW"Á7FGW5“Ê∆&V«–¢¬˜7„‡¢¬ˆÜVFW#‡¢∆Fób6∆74Ê÷S“&÷ˆ&ñ∆R÷˜&FW"÷÷WF#‡¢«7„‡¢ƒ6∆VÊF$Fó26ó¶S◊≥W“Û‡¢∂FV∆ófW'íÊ∆&V«–¢¬˜7„‡¢«7G&ˆÊsÁ∂7W'&VÊ7íÊf˜&÷BÑÁV÷&W"Ü˜&FW"ÁF˜F¬íó”¬˜7G&ˆÊs‡¢¬ˆFóc‡¢«7‚6∆74Ê÷S“&óFV◊2◊7V÷÷'í#‡¢∂˜&FW"ÊóFV◊2Ê÷ÇÜóFV“í”‚óFV“Á&ˆGV7EˆÊ÷RíÊ¶ˆñ‚Ç"¬"ó–¢¬˜7„‡¢∂˜&FW"Á7FGW2””“&FV∆ófW&VB"bb˜&FW"Á&V6VóBbbÄ¢∆'WGFˆ‡¢6∆74Ê÷S◊∂&V6VóB÷÷ˆ&ñ∆R◊7V÷÷'íG∞¢˜&FW"Á&V6VóBÊFó67&WÊ7ïˆ6˜VÁBb`¢˜&FW"Á&V6VóBÊó5˜&W6ˆ«fV@¢Ú&Ü2÷Fó67&WÊ6ñW2 ¢¢˜&FW"Á&V6VóBÊó5˜&W6ˆ«fV@¢Ú&ó2◊&W6ˆ«fVB ¢¢" ¢÷–¢ˆ‰6∆ñ6≥◊≤Çí”‚6WE&V6VóD˜&FW"Ü˜&FW"ó–¢GóS“&'WGFˆ‚ ¢‡¢ƒ6∆ó&ˆ&D6ÜV6≤6ó¶S◊≥g“Û‡¢∂˜&FW"Á&V6VóBÊFó67&WÊ7ïˆ6˜VÁ@¢Ú˜&FW"Á&V6VóBÊó5˜&W6ˆ«fV@¢Ú-	Ì-≠Ω-¬≠"+r]ÌmM]›çÚ}≠Ω-≤ ¢¢	Ì-≠Ω-¬≠"+r]ÌmM]›çíG∂˜&FW"Á&V6VóBÊFó67&WÊ7ïˆ6˜VÁG÷ ¢¢-	Ì-≠Ω-¬≠"+r]r]ÌmM]›çí'–¢¬ˆ'WGFˆ„‡¢ó–¢≤Ü˜&FW"Á7FGW2””“&6ˆÊfó&÷VB"«¿¢‰UÖEı5DEU4U5∂˜&FW"Á7FGW5“Ê∆VÊwFÇ‚íbbÄ¢∆Fób6∆74Ê÷S“&÷ˆ&ñ∆R÷7FñˆÁ2#‡¢∂˜&FW"Á7FGW2””“&G&gB"bbÄ¢∆'WGFˆ‡¢6∆74Ê÷S“'VñWB÷'WGFˆ‚G&gB÷÷ˆ&ñ∆R÷VFóB ¢Fó6&∆VC◊∑WFFñÊtñB””“˜&FW"ÊñG–¢ˆ‰6∆ñ6≥◊≤Çí”‚˜V‰˜&FW$VFóF˜"Ü˜&FW"ó–¢GóS“&'WGFˆ‚ ¢‡¢≈VÊ6ñ¬6ó¶S◊≥W“Û‡¢
]M≠-çÌ--¿¢¬ˆ'WGFˆ„‡¢ó–¢∂˜&FW"Á7FGW2””“&6ˆÊfó&÷VB"bbÄ¢∆'WGFˆ‡¢6∆74Ê÷S“'&V6VófR÷'WGFˆ‚ ¢Fó6&∆VC◊∑WFFñÊtñB””“˜&FW"ÊñG–¢ˆ‰6∆ñ6≥◊≤Çí”‚6WE&V6VóD˜&FW"Ü˜&FW"ó–¢GóS“&'WGFˆ‚ ¢‡¢ƒ6∆ó&ˆ&D6ÜV6≤6ó¶S◊≥W“Û‡¢	˝ç›˝-¿¢¬ˆ'WGFˆ„‡¢ó–¢¥‰UÖEı5DEU4U5∂˜&FW"Á7FGW5“Ê÷Çá7FGW2í”‚Ä¢∆'WGFˆ‡¢6∆74Ê÷S“'VñWB÷'WGFˆ‚ ¢Fó6&∆VC◊∑WFFñÊtñB””“˜&FW"ÊñG–¢∂Wì◊∑7FGW7–¢ˆ‰6∆ñ6≥◊≤Çí”‡¢&WVW7E7FGW46ÜÊvRÜ˜&FW"¬7FGW2ê¢–¢GóS“&'WGFˆ‚ ¢‡¢µ5DEU5Ù‘UD∑7FGW5“Ê∆&V«–¢¬ˆ'WGFˆ„‡¢íó–¢¬ˆFóc‡¢ó–¢¬ˆ'Fñ6∆S‡¢ì∞¢“ó–¢¬ˆFóc‡¢¬Û‡¢ó–¢¬˜6V7Fñˆ„‡¢¬Û‡¢ó–†¢∂7FófUfñWr””“&6F∆ˆr"b`¢Ü∆ˆFñÊrÚÄ¢∆Fób6∆74Ê÷S“'7FFR◊ÊV¬Fó&V7F˜'í÷∆ˆFñÊr#‡¢≈&Vg&W6Ñ7r6∆74Ê÷S“'7ñ‚"6ó¶S◊≥#'“Û‡¢«7„Ì	}==m]¬≠-ΩÌ3¬˜7„‡¢¬ˆFóc‡¢í¢W'&˜"ÚÄ¢∆Fób6∆74Ê÷S“'7FFR◊ÊV¬7FFR÷W'&˜"Fó&V7F˜'í÷∆ˆFñÊr#‡¢ƒ∆W'EG&ñÊv∆R6ó¶S◊≥#'“Û‡¢∆Fóc‡¢«7G&ˆÊsÌ	≠-ΩÌ2›]MÌ-=˝]”¬˜7G&ˆÊs‡¢«7„Á∂W'&˜'”¬˜7„‡¢¬ˆFóc‡¢∆'WGFˆ‡¢6∆74Ê÷S“'VñWB÷'WGFˆ‚ ¢ˆ‰6∆ñ6≥◊≤Çí”‚fˆñB∆ˆDFFÇó–¢GóS“&'WGFˆ‚ ¢‡¢≈&Vg&W6Ñ7r6ó¶S◊≥g“Û‡¢	˝Ì--Ìç-¿¢¬ˆ'WGFˆ„‡¢¬ˆFóc‡¢í¢Ä¢ƒ6F∆ˆufñWp¢'W7îñC◊∑WFFñÊu&ˆGV7DñG–¢ˆ‰VFóC◊≤á&ˆGV7Bí”‚∞¢6WDVFóFñÊu&ˆGV7Bá&ˆGV7Bì∞¢6WE&ˆGV7DG&vW$˜V‚áG'VRì∞¢◊–¢ˆÂFˆvv∆T7FófS◊∑WFFU&ˆGV7Dfñ∆&ñ∆óGó–¢&ˆGV7G3◊∑&ˆGV7G7–¢6V&6É◊∑6V&6á–¢Û‡¢íó–†¢∂7FófUfñWr””“'7W∆ñW'2"b`¢Ü∆ˆFñÊrÚÄ¢∆Fób6∆74Ê÷S“'7FFR◊ÊV¬Fó&V7F˜'í÷∆ˆFñÊr#‡¢≈&Vg&W6Ñ7r6∆74Ê÷S“'7ñ‚"6ó¶S◊≥#'“Û‡¢«7„Ì	}==m]¬˝Ì--ùç≠Ì#¬˜7„‡¢¬ˆFóc‡¢í¢W'&˜"ÚÄ¢∆Fób6∆74Ê÷S“'7FFR◊ÊV¬7FFR÷W'&˜"Fó&V7F˜'í÷∆ˆFñÊr#‡¢ƒ∆W'EG&ñÊv∆R6ó¶S◊≥#'“Û‡¢∆Fóc‡¢«7G&ˆÊsÌ	˝Ì--ùç≠Ç›]MÌ-=˝›≥¬˜7G&ˆÊs‡¢«7„Á∂W'&˜'”¬˜7„‡¢¬ˆFóc‡¢∆'WGFˆ‡¢6∆74Ê÷S“'VñWB÷'WGFˆ‚ ¢ˆ‰6∆ñ6≥◊≤Çí”‚fˆñB∆ˆDFFÇó–¢GóS“&'WGFˆ‚ ¢‡¢≈&Vg&W6Ñ7r6ó¶S◊≥g“Û‡¢	˝Ì--Ìç-¿¢¬ˆ'WGFˆ„‡¢¬ˆFóc‡¢í¢Ä¢≈7W∆ñW'5fñWp¢'W7îñC◊∑WFFñÊu7W∆ñW$ñG–¢ˆ‰VFóC◊≤á7W∆ñW"í”‚∞¢6WDVFóFñÊu7W∆ñW"á7W∆ñW"ì∞¢6WE7W∆ñW$G&vW$˜V‚áG'VRì∞¢◊–¢ˆÂFˆvv∆T7FófS◊∑WFFU7W∆ñW$fñ∆&ñ∆óGó–¢˜&FW'3◊∂˜&FW'7–¢&ˆGV7G3◊∑&ˆGV7G7–¢6V&6É◊∑6V&6á–¢7W∆ñW'3◊∑7W∆ñW'7–¢Û‡¢íó–¢¬ˆ÷ñ„‡†¢∂G&vW$˜V‚bbÄ¢ƒ˜&FW$G&vW ¢'W7ì◊∑6fñÊw–¢∂Wì◊∞¢VFóFñÊt˜&FW ¢ÚVFóB“G∂VFóFñÊt˜&FW"ÊñG÷ ¢¢FV◊∆FT˜&FW ¢Ú&WVB“G∑FV◊∆FT˜&FW"ÊñG÷ ¢¢&ÊWr ¢–¢ˆ‰6∆˜6S◊≤Çí”‚∞¢ñbÇ6fñÊrí∞¢6WDG&vW$˜V‚Üf«6Rì∞¢6WDVFóFñÊt˜&FW"ÜÁV∆¬ì∞¢6WEFV◊∆FT˜&FW"ÜÁV∆¬ì∞¢–¢◊–¢ˆÂ6fS◊∑6fT˜&FW'–¢˜&FW#◊∂VFóFñÊt˜&FW'–¢&ˆGV7G3◊∑&ˆGV7G7–¢7W∆ñW'3◊∂˜&FW&&∆U7W∆ñW'7–¢FV◊∆FS◊∑FV◊∆FT˜&FW'–¢Û‡¢ó–†¢∂FWFñ«4˜&FW"bbÄ¢ƒ˜&FW$FWFñ«4G&vW ¢ˆ‰6∆˜6S◊≤Çí”‚6WDFWFñ«4˜&FW"ÜÁV∆¬ó–¢ˆ‰VFóC◊≤Ü˜&FW"í”‚∞¢6WDFWFñ«4˜&FW"ÜÁV∆¬ì∞¢˜V‰˜&FW$VFóF˜"Ü˜&FW"ì∞¢◊–¢ˆÂ&V6VóC◊≤Ü˜&FW"í”‚∞¢6WDFWFñ«4˜&FW"ÜÁV∆¬ì∞¢6WE&V6VóD˜&FW"Ü˜&FW"ì∞¢◊–¢ˆÂ&WVC◊∑&WVD˜&FW'–¢ˆÂ&W6ˆ«fS◊≤Ü˜&FW"í”‚∞¢6WDFWFñ«4˜&FW"ÜÁV∆¬ì∞¢6WE&W6ˆ«WFñˆ‰˜&FW"Ü˜&FW"ì∞¢◊–¢˜&FW#◊∂FWFñ«4˜&FW'–¢Û‡¢ó–†¢∂6Ê6V∆∆ñÊt˜&FW"bbÄ¢ƒ6Ê6Vƒ˜&FW$Fñ∆ˆp¢'W7ì◊∑WFFñÊtñB””“6Ê6V∆∆ñÊt˜&FW"ÊñG–¢ˆ‰6∆˜6S◊≤Çí”‚∞¢ñbáWFFñÊtñB”“6Ê6V∆∆ñÊt˜&FW"ÊñBí∞¢6WD6Ê6V∆∆ñÊt˜&FW"ÜÁV∆¬ì∞¢–¢◊–¢ˆ‰6ˆÊfó&”◊∂7ñÊ2á&V6ˆ‚í”‚∞¢6ˆÁ7BWFFVB“vóBWFFU7FGW2Ä¢6Ê6V∆∆ñÊt˜&FW"¿¢&6Ê6V∆∆VB"¿¢&V6ˆ‚¿¢ì∞¢ñbáWFFVBí6WD6Ê6V∆∆ñÊt˜&FW"ÜÁV∆¬ì∞¢◊–¢˜&FW#◊∂6Ê6V∆∆ñÊt˜&FW'–¢Û‡¢ó–†¢∑&W6ˆ«WFñˆ‰˜&FW"bbÄ¢ƒFó67&WÊ7ï&W6ˆ«WFñˆ‰Fñ∆ˆp¢'W7ì◊∑WFFñÊtñB””“&W6ˆ«WFñˆ‰˜&FW"ÊñG–¢ˆ‰6∆˜6S◊≤Çí”‚∞¢ñbáWFFñÊtñB”“&W6ˆ«WFñˆ‰˜&FW"ÊñBí∞¢6WE&W6ˆ«WFñˆ‰˜&FW"ÜÁV∆¬ì∞¢–¢◊–¢ˆ‰6ˆÊfó&”◊≤ÜÊ˜FRí”‡¢WFFTFó67&WÊ7ï&W6ˆ«WFñˆ‚á&W6ˆ«WFñˆ‰˜&FW"¬Ê˜FRê¢–¢˜&FW#◊∑&W6ˆ«WFñˆ‰˜&FW'–¢Û‡¢ó–†¢∑&ˆGV7DG&vW$˜V‚bbÄ¢≈&ˆGV7DG&vW ¢'W7ì◊∑6fñÊw–¢∂Wì◊∂VFóFñÊu&ˆGV7CÚÊñBÛÚ&ÊWr'–¢ˆ‰6∆˜6S◊≤Çí”‚∞¢ñbÇ6fñÊrí∞¢6WE&ˆGV7DG&vW$˜V‚Üf«6Rì∞¢6WDVFóFñÊu&ˆGV7BÜÁV∆¬ì∞¢–¢◊–¢ˆÂ6fS◊∑6fU&ˆGV7G–¢&ˆGV7C◊∂VFóFñÊu&ˆGV7G–¢7W∆ñW'3◊∑7W∆ñW'7–¢Û‡¢ó–†¢∑7W∆ñW$G&vW$˜V‚bbÄ¢≈7W∆ñW$G&vW ¢'W7ì◊∑6fñÊw–¢∂Wì◊∂VFóFñÊu7W∆ñW#ÚÊñBÛÚ&ÊWr'–¢ˆ‰6∆˜6S◊≤Çí”‚∞¢ñbÇ6fñÊrí∞¢6WE7W∆ñW$G&vW$˜V‚Üf«6Rì∞¢6WDVFóFñÊu7W∆ñW"ÜÁV∆¬ì∞¢–¢◊–¢ˆÂ6fS◊∑6fU7W∆ñW'–¢7W∆ñW#◊∂VFóFñÊu7W∆ñW'–¢Û‡¢ó–†¢∑&V6VóD˜&FW"bbÄ¢≈&V6VóDG&vW ¢'W7ì◊∑6fñÊw–¢ˆ‰6∆˜6S◊≤Çí”‚6fñÊrbb6WE&V6VóD˜&FW"ÜÁV∆¬ó–¢ˆÂ&V6VófS◊∑&V6VófT˜&FW'–¢˜&FW#◊∑&V6VóD˜&FW'–¢Û‡¢ó–†¢∑Fˆ7BbbÄ¢∆Fób6∆74Ê÷S“'Fˆ7B"&ˆ∆S“'7FGW2#‡¢ƒ6ó&6∆T6ÜV6¥&ñr6ó¶S◊≥á“Û‡¢∑Fˆ7G–¢¬ˆFóc‡¢ó–¢¬ˆFóc‡¢ì∞ß–†¶Wá˜'BFVfV«B∞