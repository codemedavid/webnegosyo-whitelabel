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
