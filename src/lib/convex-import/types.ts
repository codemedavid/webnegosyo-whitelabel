/**
 * Shapes for moving one store's order history out of its Convex deployment and
 * into the shared platform database (`scripts/convex-to-platform/`).
 *
 * Convex rows are what `convex export` writes to `tables/<name>/documents.jsonl`
 * (`convex-template/convex/schema.ts`), read loosely: a deployment may run an
 * older bundle, so every field is optional and checked before it is used.
 * Platform rows use the column names of `public.*`, so the generated SQL can
 * read them back with `jsonb_populate_recordset`.
 */

export interface ConvexDoc {
  _id: string
  _creationTime: number
}

export interface ConvexOrder extends ConvexDoc {
  customerName?: string | null
  customerContact?: string | null
  customerData?: Record<string, unknown> | null
  total?: number
  status?: string
  orderType?: string
  orderTypeId?: string
  scheduledFor?: string
  source?: string
  clientOrderId?: string
  saleOccurredAt?: number
  dailyNumber?: number
  orderDate?: string
  itemCount?: number
  paymentMethod?: string
  paymentMethodDetails?: string
  paymentStatus?: string
  deliveryFee?: number
  serviceCharge?: number
  deliveryAddress?: string
  deliveryLatitude?: number
  deliveryLongitude?: number
  lalamoveQuotationId?: string
  lalamoveOrderId?: string
  lalamoveStatus?: string
  lalamoveDriverName?: string
  lalamoveDriverPhone?: string
  lalamoveTrackingUrl?: string
  hasUpsellItems?: boolean
  hasBundleItems?: boolean
  amountPaid?: number
  revisionNumber?: number
  editedAt?: string
  editedBy?: string
  prepMinutes?: number
  promisedReadyAt?: string
  outletId?: string
}

export interface ConvexAddon {
  name?: string
  price?: number
  quantity?: number
}

export interface ConvexVariationSelection {
  typeName?: string
  optionName?: string
  priceAdjustment?: number
}

export interface ConvexOrderItem extends ConvexDoc {
  orderId: string
  menuItemId?: string
  menuItemName?: string
  quantity?: number
  price?: number
  subtotal?: number
  specialInstructions?: string
  variation?: string
  variationSelections?: ConvexVariationSelection[] | null
  /** Current bundles write `{name, price, quantity?}`; very old rows may hold plain names. */
  addons?: Array<ConvexAddon | string> | null
  isUpsellItem?: boolean
  isBundleItem?: boolean
  bundleId?: string
  bundleName?: string
  slotName?: string
  presellDate?: string
}

export interface ConvexOrderPayment extends ConvexDoc {
  orderId: string
  occurredAt?: number
  kind?: string
  amount?: number
  paymentMethodId?: string
  paymentMethodName?: string
  reference?: string
  proofUrl?: string
  proofPublicId?: string
  recordedBy?: string
  outletId?: string
  note?: string
}

export interface ConvexOrderRevision extends ConvexDoc {
  orderId: string
  revisionNumber?: number
  itemsBefore?: unknown
  itemsAfter?: unknown
  totalBefore?: number
  totalAfter?: number
  reason?: string
  revisedBy?: string
  outletId?: string
}

export interface ConvexProductCost extends ConvexDoc {
  menuItemId?: string
  costPrice?: number
  costNotes?: string
  createdAt?: number
  updatedAt?: number
}

export interface ConvexTenantConfig extends ConvexDoc {
  key?: string
  value?: string
}

/** The tables the import reads, plus a row count for every other table in the export. */
export interface ConvexSnapshot {
  orders: ConvexOrder[]
  orderItems: ConvexOrderItem[]
  orderPayments: ConvexOrderPayment[]
  orderRevisions: ConvexOrderRevision[]
  productCosts: ConvexProductCost[]
  tenantConfig: ConvexTenantConfig[]
  /** Every table in the export (including the ones above) → its row count. */
  tableCounts: Record<string, number>
}

/** Tables that hold a text `order_id` claim the inventory code finds a void or edit by. */
export const REKEY_TABLES = [
  'order_stock_applications',
  'simple_option_stock_applications',
  'simple_option_stock_movements',
  'presell_stock_applications',
  'stock_movements',
] as const
export type RekeyTable = (typeof REKEY_TABLES)[number]

/** Rows keyed by a Convex order id that the import never changes (append-only logs and other records). */
export const UNTOUCHED_KEYED_TABLES = [
  'order_status_events',
  'inventory_audit_log',
  'store_activity',
  'voucher_redemptions',
  'loyalty_ledger',
  'gov_discount_claims',
  'approval_requests',
] as const
export type UntouchedKeyedTable = (typeof UNTOUCHED_KEYED_TABLES)[number]

export interface PlatformTenant {
  id: string
  slug: string
  orderBackend: string | null
  convexDeploymentUrl: string | null
  loyaltyEnabled: boolean
  loyaltyShadow: boolean
  timezone: string | null
}

export interface PlatformOrderType {
  id: string
  tenantId: string
  name: string | null
}

export interface PlatformPaymentMethod {
  id: string
  name: string
}

/** A platform order already in the store's history (its own or an earlier import). */
export interface PlatformExistingOrder {
  id: string
  clientOrderId: string | null
  orderDate: string | null
  dailyNumber: number | null
  createdAt: string
}

/**
 * What the platform database holds for this store, read once (service role,
 * paged) by the CLI or built directly by a test. Pure input: nothing here is
 * customer data except ids.
 */
export interface PlatformState {
  tenant: PlatformTenant
  menuItemIds: string[]
  /** The store's own order types plus any type id the snapshot names (whatever store owns it). */
  orderTypes: PlatformOrderType[]
  paymentMethods: PlatformPaymentMethod[]
  outletIds: string[]
  existingOrders: PlatformExistingOrder[]
  /** Menu items that already have a platform `product_costs` row (it wins over the Convex cost). */
  productCostMenuItemIds: string[]
  /** Convex order ids that rows in each rekeyed table still point at. */
  convexKeyed: Record<RekeyTable, string[]>
  /** Rows in tables the import leaves alone that point at a Convex order id. */
  untouchedKeyed: Partial<Record<UntouchedKeyedTable, number>>
  /** Convex order ids with a `customer_external_orders` link (→ `orders.customer_id`). */
  customerLinkedConvexIds: string[]
  /** Convex order ids that already have an `order.placed` activity row written for the Convex order. */
  activityPlacedConvexIds: string[]
}

export type ProblemSeverity = 'block' | 'warn' | 'info'

/** One finding of the plan. `detail` never carries a customer field. */
export interface Problem {
  code: string
  severity: ProblemSeverity
  count: number
  detail: string
}

export interface PlatformOrderRow {
  id: string
  tenant_id: string
  customer_name: string | null
  customer_contact: string | null
  total: number
  status: string
  created_at: string
  updated_at: string
  order_type_id: string | null
  order_type: string | null
  customer_data: Record<string, unknown>
  delivery_fee: number
  service_charge_amount: number
  scheduled_for: string | null
  payment_method_id: string | null
  payment_method_name: string | null
  payment_method_details: string | null
  payment_status: string
  payment_proof_url: string | null
  payment_proof_public_id: string | null
  payment_proof_reference: string | null
  source: string
  client_order_id: string | null
  item_count: number | null
  has_upsell_items: boolean
  has_bundle_items: boolean
  outlet_id: string | null
  amount_paid: number
  revision_number: number
  edited_at: string | null
  edited_by: string | null
  discount_total: number
  discount_data: Record<string, unknown> | null
  lalamove_quotation_id: string | null
  lalamove_order_id: string | null
  lalamove_status: string | null
  lalamove_driver_name: string | null
  lalamove_driver_phone: string | null
  lalamove_tracking_url: string | null
  prep_minutes: number | null
  promised_ready_at: string | null
  daily_number: number | null
  order_date: string | null
}

export interface PlatformOrderItemRow {
  id: string
  order_id: string
  menu_item_id: string | null
  menu_item_name: string
  variation: string | null
  addons: string[]
  addon_details: Array<{ name: string; price: number | null; quantity: number }> | null
  quantity: number
  price: number
  subtotal: number
  special_instructions: string | null
  variation_selections: ConvexVariationSelection[] | null
  is_upsell_item: boolean
  is_bundle_item: boolean
  bundle_id: string | null
  bundle_name: string | null
  slot_name: string | null
}

export interface PlatformOrderPaymentRow {
  id: string
  tenant_id: string
  order_id: string
  kind: 'charge' | 'refund'
  amount: number
  payment_method_id: string | null
  payment_method_name: string | null
  reference: string | null
  proof_url: string | null
  proof_public_id: string | null
  recorded_by: string | null
  outlet_id: string | null
  note: string | null
  created_at: string
}

export interface PlatformOrderRevisionRow {
  id: string
  tenant_id: string
  order_id: string
  revision_number: number
  items_before: unknown
  items_after: unknown
  total_before: number
  total_after: number
  reason: string | null
  revised_by: string | null
  outlet_id: string | null
  created_at: string
}

export interface PlatformProductCostRow {
  id: string
  tenant_id: string
  menu_item_id: string
  cost_price: number
  cost_notes: string | null
  created_at: string
  updated_at: string
}

export interface ImportRows {
  orders: PlatformOrderRow[]
  order_items: PlatformOrderItemRow[]
  order_payments: PlatformOrderPaymentRow[]
  order_revisions: PlatformOrderRevisionRow[]
  product_costs: PlatformProductCostRow[]
  /** Convex order id → the platform order id its rows end up under (the import's, or an existing duplicate's). */
  idMap: Record<string, string>
}
