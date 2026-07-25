export type OrderStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "delivered"
  | "cancelled";

export interface Supplier {
  id: number;
  name: string;
  contact_name: string;
  phone: string;
  lead_time_days: number;
  is_active: boolean;
}

export interface SupplierDraft {
  name: string;
  contact_name: string;
  phone: string;
  lead_time_days: number;
}

export interface SupplierOffer {
  supplier_id: number;
  supplier: Supplier;
  supplier_sku: string;
  unit_price: string;
  minimum_order: string;
  is_preferred: boolean;
  updated_at: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  is_active: boolean;
  created_at: string;
  offers: SupplierOffer[];
}

export interface SupplierOfferDraft {
  supplier_id: number;
  supplier_sku: string;
  unit_price: number;
  minimum_order: number;
  is_preferred: boolean;
}

export interface ProductDraft {
  sku: string;
  name: string;
  category: string;
  unit: string;
  offers: SupplierOfferDraft[];
}

export interface OrderItem {
  id: number;
  product_id: number | null;
  product_name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  line_total: string;
}

export interface ReceiptItem {
  id: number;
  order_item_id: number;
  order_item: OrderItem;
  received_quantity: string;
  rejected_quantity: string;
  note: string;
  accepted_quantity: string;
  quantity_variance: string;
  has_discrepancy: boolean;
}

export interface Receipt {
  id: number;
  order_id: number;
  received_by: string;
  note: string;
  is_resolved: boolean;
  resolution_note: string;
  resolved_at: string | null;
  received_at: string;
  items: ReceiptItem[];
  discrepancy_count: number;
  accepted_total: string;
}

export type OrderEventType =
  | "created"
  | "status_changed"
  | "received"
  | "snapshot"
  | "discrepancy_resolved"
  | "discrepancy_reopened";

export interface OrderStatusEvent {
  id: number;
  event_type: OrderEventType;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string;
  created_at: string;
}

export interface PurchaseOrder {
  id: number;
  number: string;
  supplier: Supplier;
  delivery_date: string;
  status: OrderStatus;
  note: string;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  total: string;
  receipt: Receipt | null;
  status_history: OrderStatusEvent[];
}

export interface OrderItemDraft {
  product_id: number;
  quantity: number;
}

export interface OrderDraft {
  supplier_id: number;
  delivery_date: string;
  note: string;
  items: OrderItemDraft[];
}

export interface ReceiptItemDraft {
  order_item_id: number;
  received_quantity: number;
  rejected_quantity: number;
  note: string;
}

export interface ReceiptDraft {
  received_by: string;
  note: string;
  items: ReceiptItemDraft[];
}
