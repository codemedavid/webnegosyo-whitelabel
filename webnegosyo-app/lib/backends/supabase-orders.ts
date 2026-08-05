/**
 * Row <-> DTO mapping for tenants whose orders live in the shared platform
 * Supabase database (`order_backend = 'platform'`).
 *
 * Every screen in this app addresses its backend through a string function ref
 * (`"orders:getOrders"`) that funnels into the three hooks in `lib/hooks.ts`.
 * Those hooks are the only dispatch point, so a platform tenant reaches these
 * mappers instead of Convex — and the SCREENS DO NOT CHANGE. That makes the
 * screens' existing DTO interfaces (`_id`, `_creationTime`, camelCase) the
 * output contract here; see `components/OrderCard.tsx:OrderCardOrder`.
 *
 * Everything in this file is pure: rows in, DTOs out. The Supabase queries that
 * fetch those rows live in `supabase-adapter.ts`, so the shaping rules that
 * actually decide what a merchant sees stay unit-testable without a database.
 *
 * Behaviour mirrors `convex-template/convex/orders.ts`. When that file changes,
 * change this one — a divergence shows up as two tenants on the same app
 * seeing different numbers for the same day.
 */

import { ORDER_OUTLET_ID_KEY } from "../order-outlet";

/** Statuses an order can hold, in pipeline order. */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Buckets the dashboard's live queue renders, in display order. */
export const QUEUE_STATUSES = ["pending", "confirmed", "preparing", "ready"] as const;

export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/** Where an order was rung up. */
export type OrderSource = "web" | "mobile" | "qr_handoff" | "pos";

/**
 * Sources the merchant rings up themselves — scanning a customer's QR, or a
 * counter sale. Nobody is left to approve them, so they skip the pending queue.
 * Mirrors the `skipPending` rule in `convex-template/convex/orders.ts`.
 */
const SELF_CONFIRMING_SOURCES: readonly OrderSource[] = ["qr_handoff", "pos"];

export interface OrderAddon {
  name: string;
  price: number;
  quantity?: number;
}

export interface OrderVariationSelection {
  typeName: string;
  optionName: string;
  priceAdjustment: number;
}

/** A `public.order_items` row as PostgREST returns it. */
export interface PlatformOrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  menu_item_name: string | null;
  quantity: number | null;
  price: number | null;
  subtotal: number | null;
  variation: string | null;
  variation_selections: OrderVariationSelection[] | null;
  addons: OrderAddon[] | string[] | null;
  special_instructions: string | null;
  is_upsell_item: boolean | null;
  is_bundle_item: boolean | null;
  bundle_id: string | null;
  bundle_name: string | null;
  slot_name: string | null;
}

/** A `public.orders` row as PostgREST returns it. */
export interface PlatformOrderRow {
  id: string;
  tenant_id: string;
  /** Branch that took the order; null on every single-location tenant. */
  outlet_id?: string | null;
  customer_name: string | null;
  customer_contact: string | null;
  customer_data: Record<string, unknown> | null;
  total: number | null;
  item_count: number | null;
  status: string;
  source: string | null;
  order_type: string | null;
  order_type_id: string | null;
  payment_status: string | null;
  payment_method_name: string | null;
  payment_method_details: string | null;
  delivery_fee: number | null;
  delivery_address?: string | null;
  /**
   * Lalamove's booking trail. `lalamove_quotation_id` is written at checkout
   * when the customer picks Lalamove delivery; the rest are written by
   * whoever books the driver. The merchant app's delivery card is driven
   * entirely by these six columns — drop them from the projection and a
   * platform-backed store sees no Lalamove UI at all.
   */
  lalamove_quotation_id?: string | null;
  lalamove_order_id?: string | null;
  lalamove_status?: string | null;
  lalamove_driver_name?: string | null;
  lalamove_driver_phone?: string | null;
  lalamove_tracking_url?: string | null;
  scheduled_for: string | null;
  client_order_id: string | null;
  /** Bumped by every saved edit; the optimistic lock is checked against it. */
  revision_number?: number | null;
  /** Trigger-maintained cache of the `order_payments` ledger. */
  amount_paid?: number | null;
  created_at: string;
  updated_at: string | null;
}

/** A `public.order_payments` row as PostgREST returns it. */
export interface PlatformOrderPaymentRow {
  id: string;
  order_id: string;
  kind: "charge" | "refund";
  amount: number | null;
  payment_method_id: string | null;
  payment_method_name: string | null;
  reference: string | null;
  proof_url: string | null;
  proof_public_id: string | null;
  recorded_by: string | null;
  outlet_id: string | null;
  note: string | null;
  created_at: string;
}

/** A `public.order_revisions` row as PostgREST returns it. */
export interface PlatformOrderRevisionRow {
  id: string;
  order_id: string;
  revision_number: number | null;
  items_before: unknown[] | null;
  items_after: unknown[] | null;
  total_before: number | null;
  total_after: number | null;
  reason: string | null;
  revised_by: string | null;
  outlet_id: string | null;
  created_at: string;
}

export interface OrderItemDto {
  _id: string;
  /** Parent order. Convex items carry this too; day-attribution needs it. */
  orderId: string;
  menuItemId: string | null;
  menuItemName: string;
  quantity: number;
  price: number;
  subtotal: number;
  variation?: string;
  variationSelections?: OrderVariationSelection[];
  addons: OrderAddon[];
  specialInstructions?: string;
  isUpsellItem?: boolean;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}

export interface OrderDto {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  customerData?: Record<string, unknown>;
  total: number;
  itemCount: number;
  status: string;
  source?: string;
  orderType?: string;
  orderTypeId?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  paymentMethodDetails?: string;
  deliveryFee?: number;
  /** Where the driver is taking it. Also the address Lalamove books against. */
  deliveryAddress?: string;
  lalamoveQuotationId?: string;
  lalamoveOrderId?: string;
  lalamoveStatus?: string;
  lalamoveDriverName?: string;
  lalamoveDriverPhone?: string;
  lalamoveTrackingUrl?: string;
  scheduledFor?: string;
  clientOrderId?: string;
  /**
   * How many times this order has been edited. Always a number: the edit
   * screen submits it as the optimistic lock, and an absent value there would
   * read as revision 0 and refuse every edit after the first.
   */
  revisionNumber: number;
  /** Net of the settlement ledger. 0 on an order billed but not yet paid. */
  amountPaid: number;
}

export interface OrderWithItemsDto extends OrderDto {
  items: OrderItemDto[];
}

/**
 * A settlement row as the screens receive it, matching the Convex
 * `orderPayments` document field-for-field so one component renders both.
 */
export interface OrderPaymentDto {
  _id: string;
  _creationTime: number;
  orderId: string;
  kind: "charge" | "refund";
  /** Always positive; `kind` carries the direction. */
  amount: number;
  paymentMethodId?: string;
  paymentMethodName?: string;
  reference?: string;
  proofUrl?: string;
  proofPublicId?: string;
  recordedBy?: string;
  outletId?: string;
  note?: string;
}

/** An edit snapshot as the screens receive it, matching Convex `orderRevisions`. */
export interface OrderRevisionDto {
  _id: string;
  _creationTime: number;
  orderId: string;
  revisionNumber: number;
  itemsBefore: unknown[];
  itemsAfter: unknown[];
  totalBefore: number;
  totalAfter: number;
  reason?: string;
  revisedBy?: string;
  outletId?: string;
}

export type RealtimeQueue = Record<QueueStatus, OrderDto[]>;

export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  statusCounts: Record<string, number>;
}

// --- day boundaries -------------------------------------------------------

/** Default UTC offset: Philippines (Asia/Manila) is a fixed UTC+8, no DST. */
export const DEFAULT_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Epoch ms of 00:00 local time for the local day containing `atMs`.
 *
 * Postgres and the app both run in UTC, but merchants trade in their own
 * timezone. Bucketing "today" on the UTC boundary would shift the day by ~8h
 * for PH — the first eight hours of trading would land on the previous date.
 * Mirrors `convex-template/convex/time.ts`.
 */
export function localDayStartMs(
  atMs: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): number {
  return Math.floor((atMs + offsetMs) / DAY_MS) * DAY_MS - offsetMs;
}

// --- row -> DTO -----------------------------------------------------------

/**
 * Postgres `numeric` arrives as a string over PostgREST. Left uncoerced, money
 * totals would concatenate instead of add.
 */
function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** Only set an optional DTO field when the column actually holds something. */
function optional<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

/** `order_items.addons` is a legacy `text[]` on older rows and jsonb on newer ones. */
function normalizeAddons(addons: PlatformOrderItemRow["addons"]): OrderAddon[] {
  if (!Array.isArray(addons)) return [];
  return addons.map((addon) =>
    typeof addon === "string"
      ? { name: addon, price: 0 }
      : {
          name: addon?.name ?? "",
          price: toNumber(addon?.price),
          ...(addon?.quantity === undefined ? {} : { quantity: toNumber(addon.quantity) }),
        }
  );
}

export function toOrderItemDto(row: PlatformOrderItemRow): OrderItemDto {
  return {
    _id: row.id,
    orderId: row.order_id,
    menuItemId: row.menu_item_id,
    menuItemName: row.menu_item_name ?? "",
    quantity: toNumber(row.quantity),
    price: toNumber(row.price),
    subtotal: toNumber(row.subtotal),
    variation: optional(row.variation),
    variationSelections: optional(row.variation_selections),
    addons: normalizeAddons(row.addons),
    specialInstructions: optional(row.special_instructions),
    isUpsellItem: optional(row.is_upsell_item),
    isBundleItem: optional(row.is_bundle_item),
    bundleId: optional(row.bundle_id),
    bundleName: optional(row.bundle_name),
    slotName: optional(row.slot_name),
  };
}

/**
 * `items` is only needed for rows written before `item_count` existed; the
 * count is otherwise read straight off the column.
 */
export function toOrderDto(
  row: PlatformOrderRow,
  items: readonly PlatformOrderItemRow[] = []
): OrderDto {
  const itemCount =
    row.item_count === null || row.item_count === undefined
      ? items.reduce((sum, item) => sum + toNumber(item.quantity), 0)
      : toNumber(row.item_count);

  return {
    _id: row.id,
    _creationTime: Date.parse(row.created_at),
    customerName: row.customer_name ?? "",
    customerContact: row.customer_contact ?? "",
    customerData: optional(row.customer_data),
    total: toNumber(row.total),
    itemCount,
    status: row.status,
    source: optional(row.source),
    orderType: optional(row.order_type),
    orderTypeId: optional(row.order_type_id),
    paymentStatus: optional(row.payment_status),
    paymentMethod: optional(row.payment_method_name),
    paymentMethodDetails: optional(row.payment_method_details),
    deliveryFee: row.delivery_fee === null ? undefined : toNumber(row.delivery_fee),
    deliveryAddress: optional(row.delivery_address),
    lalamoveQuotationId: optional(row.lalamove_quotation_id),
    lalamoveOrderId: optional(row.lalamove_order_id),
    lalamoveStatus: optional(row.lalamove_status),
    lalamoveDriverName: optional(row.lalamove_driver_name),
    lalamoveDriverPhone: optional(row.lalamove_driver_phone),
    lalamoveTrackingUrl: optional(row.lalamove_tracking_url),
    scheduledFor: optional(row.scheduled_for),
    clientOrderId: optional(row.client_order_id),
    revisionNumber: toNumber(row.revision_number),
    amountPaid: toNumber(row.amount_paid),
  };
}

/**
 * One settlement row, in the camelCase shape Convex returns its own documents.
 *
 * The edit session nets these through `computeBalance`, which reads `kind` and
 * `amount`. Handing it snake_case would net to zero and report a fully-paid
 * order as unpaid — so the mapping is load-bearing, not cosmetic.
 */
export function toOrderPaymentDto(row: PlatformOrderPaymentRow): OrderPaymentDto {
  return {
    _id: row.id,
    _creationTime: Date.parse(row.created_at),
    orderId: row.order_id,
    kind: row.kind,
    amount: toNumber(row.amount),
    paymentMethodId: optional(row.payment_method_id),
    paymentMethodName: optional(row.payment_method_name),
    reference: optional(row.reference),
    proofUrl: optional(row.proof_url),
    proofPublicId: optional(row.proof_public_id),
    recordedBy: optional(row.recorded_by),
    outletId: optional(row.outlet_id),
    note: optional(row.note),
  };
}

/** One before/after edit snapshot, in the shape Convex returns. */
export function toOrderRevisionDto(row: PlatformOrderRevisionRow): OrderRevisionDto {
  return {
    _id: row.id,
    _creationTime: Date.parse(row.created_at),
    orderId: row.order_id,
    revisionNumber: toNumber(row.revision_number),
    itemsBefore: row.items_before ?? [],
    itemsAfter: row.items_after ?? [],
    totalBefore: toNumber(row.total_before),
    totalAfter: toNumber(row.total_after),
    reason: optional(row.reason),
    revisedBy: optional(row.revised_by),
    outletId: optional(row.outlet_id),
  };
}

export function toOrderWithItems(
  row: PlatformOrderRow,
  items: readonly PlatformOrderItemRow[]
): OrderWithItemsDto {
  return { ...toOrderDto(row, items), items: items.map(toOrderItemDto) };
}

// --- aggregation ----------------------------------------------------------

/** Newest first, matching Convex's `.order("desc")`. */
function byNewestFirst(a: OrderDto, b: OrderDto): number {
  return b._creationTime - a._creationTime;
}

/**
 * Split open orders into the dashboard's four live buckets. Delivered and
 * cancelled orders are closed and never appear in the queue.
 */
export function groupRealtimeQueue(rows: readonly PlatformOrderRow[]): RealtimeQueue {
  const queue = {} as RealtimeQueue;
  for (const status of QUEUE_STATUSES) {
    queue[status] = rows
      .filter((row) => row.status === status)
      .map((row) => toOrderDto(row))
      .sort(byNewestFirst);
  }
  return queue;
}

/**
 * Revenue and order-count metrics exclude cancelled orders so a cancellation
 * immediately drops out of the day's takings. The status breakdown still counts
 * them — the merchant needs to see how many were cancelled.
 */
export function summarizeDashboardStats(
  rows: readonly PlatformOrderRow[]
): DashboardStats {
  const completed = rows.filter((row) => row.status !== "cancelled");
  const totalRevenue = completed.reduce((sum, row) => sum + toNumber(row.total), 0);

  const statusCounts: Record<string, number> = {};
  for (const status of ORDER_STATUSES) statusCounts[status] = 0;
  for (const row of rows) {
    // An unrecognized status must not create an undefined bucket that later
    // increments to NaN.
    if (statusCounts[row.status] === undefined) continue;
    statusCounts[row.status] += 1;
  }

  return {
    totalOrders: completed.length,
    totalRevenue,
    avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
    statusCounts,
  };
}

// --- insert payloads ------------------------------------------------------

export interface CreateOrderItemArgs {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  price: number;
  subtotal: number;
  specialInstructions?: string;
  variation?: string;
  variationSelections?: OrderVariationSelection[];
  addons?: OrderAddon[];
  isUpsellItem?: boolean;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}

export interface CreateOrderArgs {
  customerName: string;
  customerContact: string;
  customerData?: Record<string, unknown>;
  total: number;
  itemCount: number;
  source: OrderSource;
  orderType?: string;
  orderTypeId?: string;
  scheduledFor?: string;
  clientOrderId?: string;
  paymentMethod?: string;
  paymentMethodDetails?: string;
  deliveryFee?: number;
  items: CreateOrderItemArgs[];
}

export interface OrderInsert {
  tenant_id: string;
  /**
   * Branch that took the order. The platform database has a real column for it;
   * the other backends only have `customer_data`, so both carry it.
   */
  outlet_id: string | null;
  customer_name: string;
  customer_contact: string;
  customer_data: Record<string, unknown> | null;
  total: number;
  item_count: number;
  status: OrderStatus;
  payment_status: string;
  source: OrderSource;
  order_type: string | null;
  order_type_id: string | null;
  payment_method_name: string | null;
  payment_method_details: string | null;
  delivery_fee: number | null;
  scheduled_for: string | null;
  client_order_id: string | null;
  has_upsell_items: boolean;
  has_bundle_items: boolean;
}

export interface OrderItemInsert {
  menu_item_id: string;
  menu_item_name: string;
  quantity: number;
  price: number;
  subtotal: number;
  special_instructions: string | null;
  variation: string | null;
  variation_selections: OrderVariationSelection[] | null;
  addons: OrderAddon[] | null;
  is_upsell_item: boolean;
  is_bundle_item: boolean;
  bundle_id: string | null;
  bundle_name: string | null;
  slot_name: string | null;
}

/**
 * The branch a new order belongs to, read out of the blob the register stamped.
 *
 * `buildPosOrder` writes the branch into `customerData`, because that is the
 * only carrier Convex and tenant-owned projects have. The platform database
 * also has an `outlet_id` column, and order reads are narrowed by that column
 * server-side — so a counter sale that filled only the blob would be invisible
 * to the very branch that rang it up. Promoting it here, at the one place every
 * platform order is built, keeps the two in step.
 *
 * A blank or non-string value yields null rather than an empty string: an empty
 * string is not a valid uuid, and Postgres would reject the whole sale.
 */
function outletIdFromCustomerData(
  customerData: Record<string, unknown> | undefined
): string | null {
  const value = customerData?.[ORDER_OUTLET_ID_KEY];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Build the rows a new order writes. Split from the insert itself so the status
 * rule — which decides whether a merchant has to tap "confirm" — is provable
 * without a database.
 */
export function buildCreateOrderRows(
  tenantId: string,
  args: CreateOrderArgs
): { order: OrderInsert; items: OrderItemInsert[] } {
  const order: OrderInsert = {
    tenant_id: tenantId,
    outlet_id: outletIdFromCustomerData(args.customerData),
    customer_name: args.customerName,
    customer_contact: args.customerContact,
    customer_data: args.customerData ?? null,
    total: args.total,
    item_count: args.itemCount,
    status: SELF_CONFIRMING_SOURCES.includes(args.source) ? "confirmed" : "pending",
    payment_status: "pending",
    source: args.source,
    order_type: args.orderType ?? null,
    order_type_id: args.orderTypeId ?? null,
    payment_method_name: args.paymentMethod ?? null,
    payment_method_details: args.paymentMethodDetails ?? null,
    delivery_fee: args.deliveryFee ?? null,
    scheduled_for: args.scheduledFor ?? null,
    client_order_id: args.clientOrderId ?? null,
    has_upsell_items: args.items.some((item) => item.isUpsellItem === true),
    has_bundle_items: args.items.some((item) => item.isBundleItem === true),
  };

  const items: OrderItemInsert[] = args.items.map((item) => ({
    menu_item_id: item.menuItemId,
    menu_item_name: item.menuItemName,
    quantity: item.quantity,
    price: item.price,
    subtotal: item.subtotal,
    special_instructions: item.specialInstructions ?? null,
    variation: item.variation ?? null,
    variation_selections: item.variationSelections ?? null,
    addons: item.addons ?? null,
    is_upsell_item: item.isUpsellItem === true,
    is_bundle_item: item.isBundleItem === true,
    bundle_id: item.bundleId ?? null,
    bundle_name: item.bundleName ?? null,
    slot_name: item.slotName ?? null,
  }));

  return { order, items };
}
