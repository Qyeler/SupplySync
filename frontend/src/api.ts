import type {
  OrderDraft,
  OrderStatus,
  Product,
  ProductDraft,
  PurchaseOrder,
  ReceiptDraft,
  Supplier,
  SupplierDraft,
} from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?:
        | string
        | Array<{
            loc?: Array<string | number>;
            msg?: string;
          }>;
    } | null;
    const detail = payload?.detail;
    const message = Array.isArray(detail)
      ? detail
          .map((issue) => issue.msg)
          .filter((item): item is string => Boolean(item))
          .join("; ")
      : detail;
    throw new Error(message || "Не удалось выполнить запрос");
  }

  return response.json() as Promise<T>;
}

export const api = {
  listOrders: () => request<PurchaseOrder[]>("/api/orders"),
  listSuppliers: (activeOnly = false) =>
    request<Supplier[]>(`/api/suppliers?active_only=${activeOnly}`),
  createSupplier: (draft: SupplierDraft) =>
    request<Supplier>("/api/suppliers", {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  updateSupplier: (supplierId: number, draft: SupplierDraft) =>
    request<Supplier>(`/api/suppliers/${supplierId}`, {
      method: "PATCH",
      body: JSON.stringify(draft),
    }),
  updateSupplierStatus: (supplierId: number, isActive: boolean) =>
    request<Supplier>(`/api/suppliers/${supplierId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    }),
  listProducts: (activeOnly = true) =>
    request<Product[]>(`/api/products?active_only=${activeOnly}`),
  createProduct: (draft: ProductDraft) =>
    request<Product>("/api/products", {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  updateProduct: (productId: number, draft: ProductDraft) =>
    request<Product>(`/api/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify(draft),
    }),
  updateProductStatus: (productId: number, isActive: boolean) =>
    request<Product>(`/api/products/${productId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    }),
  createOrder: (draft: OrderDraft) =>
    request<PurchaseOrder>("/api/orders", {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  updateOrder: (orderId: number, draft: OrderDraft) =>
    request<PurchaseOrder>(`/api/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify(draft),
    }),
  receiveOrder: (orderId: number, draft: ReceiptDraft) =>
    request<PurchaseOrder>(`/api/orders/${orderId}/receipt`, {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  updateReceiptResolution: (
    orderId: number,
    isResolved: boolean,
    note: string,
  ) =>
    request<PurchaseOrder>(`/api/orders/${orderId}/receipt/resolution`, {
      method: "PATCH",
      body: JSON.stringify({ is_resolved: isResolved, note }),
    }),
  updateStatus: (orderId: number, status: OrderStatus, reason = "") =>
    request<PurchaseOrder>(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason }),
    }),
};
