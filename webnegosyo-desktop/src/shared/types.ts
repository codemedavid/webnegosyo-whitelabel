export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled'

export interface VariationSelection {
  typeName: string
  optionName: string
  priceAdjustment: number
}

export interface OrderItemAddon {
  name: string
  price: number
  quantity?: number
}

export interface OrderItem {
  _id?: string
  menuItemName: string
  quantity: number
  price: number
  subtotal: number
  variation?: string
  variationSelections?: VariationSelection[]
  addons?: OrderItemAddon[]
  specialInstructions?: string
  isBundleItem?: boolean
  bundleName?: string
  slotName?: string
}

export interface Order {
  _id: string
  _creationTime: number
  customerName: string
  customerContact: string
  customerData?: Record<string, unknown>
  status: OrderStatus
  orderType?: string
  source: 'web' | 'mobile' | 'qr_handoff' | 'pos'
  total: number
  itemCount: number
  paymentMethod?: string
  paymentMethodDetails?: string
  paymentStatus?: string
  deliveryFee?: number
  deliveryAddress?: string
  items?: OrderItem[]
}

export interface ReceiptPayload {
  order: Order
  tenantName: string
  copyLabel?: string
}

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export interface AppSettings {
  printerName: string
  paperWidthMm: 58 | 80
  autoPrintEnabled: boolean
  receiptFooter: string
}

export interface PrintResult {
  ok: boolean
  skipped?: boolean
  error?: string
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

// ---- Offline-first POS local persistence ----

export type PosOrderSyncStatus = 'pending' | 'synced'

export interface PosOrderItemPayload {
  menuItemId: string
  menuItemName: string
  quantity: number
  price: number
  subtotal: number
  specialInstructions?: string
  variation?: string
  variationSelections?: Array<{ typeName: string; optionName: string; priceAdjustment: number }>
  addons?: Array<{ name: string; price: number }>
}

/**
 * Exact argument shape for the Convex `orders:createOrder` mutation, snapshotted
 * at sale time so syncing is a pure network replay (no recomputation needed).
 */
export interface PosOrderPayload {
  customerName: string
  customerContact: string
  customerData?: Record<string, unknown>
  total: number
  orderType?: string
  orderTypeId?: string
  source: 'pos'
  clientOrderId: string
  itemCount: number
  paymentMethod?: string
  paymentMethodDetails?: string
  items: PosOrderItemPayload[]
}

/**
 * A sale recorded on this PC. The local store is the source of truth for the
 * sale until it is confirmed synced to Convex.
 */
export interface LocalPosOrder {
  clientOrderId: string
  payload: PosOrderPayload
  paymentStatus: 'paid' | 'pending'
  createdAt: number
  syncStatus: PosOrderSyncStatus
  syncedAt?: number
  convexOrderId?: string
  attempts: number
  lastError?: string
}

/**
 * Catalog snapshot cached so the POS register works fully offline. Payment
 * methods are keyed by order-type id ('' = the unfiltered set).
 */
export interface PosCatalogCache {
  tenantId: string
  updatedAt: number
  categories: unknown[]
  menuItems: unknown[]
  orderTypes: unknown[]
  paymentMethods: Record<string, unknown[]>
}

/** Cached merchant identity so auth/tenant resolves offline on restart. */
export interface PosTenantCache {
  userId: string
  tenantId: string
  tenantSlug: string
  tenantName: string
  convexUrl: string | null
  updatedAt: number
}
