/**
 * The rows an order edit writes, and the money row that settles it.
 *
 * Split from the adapter so the rules that protect a real customer's bill are
 * provable without a database.
 *
 * The governing principle: NOTHING about the money comes from the caller. The
 * total is recomputed from the items, each line's subtotal is forced to
 * `price x quantity`, and implausible values are rejected outright. The
 * platform `createOrder` path does trust `args.total` — deliberately, since it
 * came from the register's own arithmetic — but an edit rewrites an order that
 * already exists and may already be paid, so the same trust is not extended.
 *
 * Pure and side-effect free: the caller supplies `editedAt` rather than this
 * module reading the clock, so a retry writes the same row.
 */

import type { OrderAddon, OrderVariationSelection } from "./supabase-orders";

/** An item as the edit screen submits it. */
export interface ReviseOrderItem {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  price: number;
  subtotal: number;
  specialInstructions?: string;
  variationSelections?: OrderVariationSelection[];
  addons?: OrderAddon[];
}

export interface ReviseOrderArgs {
  orderId: string;
  /**
   * The revision the edit screen loaded. If the order has moved on since,
   * someone else saved first and this edit is refused rather than clobbering.
   */
  expectedRevisionNumber: number;
  items: ReviseOrderItem[];
  deliveryFee?: number;
  serviceChargeAmount?: number;
  reason?: string;
  revisedBy?: string;
  outletId?: string;
  /** ISO timestamp, supplied by the caller so retries stay idempotent. */
  editedAt?: string;
}

/** The order as it stands before this edit. */
export interface PreviousOrderState {
  revisionNumber: number;
  total: number;
  items: ReviseOrderItem[];
}

export interface OrderRevisionPatch {
  total: number;
  item_count: number;
  revision_number: number;
  edited_at: string | null;
  edited_by: string | null;
}

export interface OrderItemRow {
  menu_item_id: string;
  menu_item_name: string;
  quantity: number;
  price: number;
  subtotal: number;
  special_instructions: string | null;
  variation_selections: OrderVariationSelection[] | null;
  addons: OrderAddon[] | null;
}

export interface OrderRevisionRow {
  tenant_id: string;
  order_id: string;
  revision_number: number;
  items_before: ReviseOrderItem[];
  items_after: ReviseOrderItem[];
  total_before: number;
  total_after: number;
  reason: string | null;
  revised_by: string | null;
  outlet_id: string | null;
}

/** Guard rails mirroring the web checkout's server-side validation. */
const MAX_PRICE = 1_000_000;
const MAX_QUANTITY = 99;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Validate one line and force its arithmetic.
 *
 * The subtotal is DERIVED, never accepted: it is the only number the order
 * total is built from, so trusting a caller's value would make every other
 * check here decorative.
 */
function toItemRow(item: ReviseOrderItem): OrderItemRow {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > MAX_QUANTITY) {
    throw new Error(
      `Invalid quantity for "${item.menuItemName}" — must be between 1 and ${MAX_QUANTITY}.`,
    );
  }

  if (!Number.isFinite(item.price) || item.price < 0 || item.price > MAX_PRICE) {
    throw new Error(`Invalid price for "${item.menuItemName}".`);
  }

  // The subtotal is built from the price actually STORED, not the raw
  // submitted one. Rounding the price for storage and then totalling the
  // unrounded value writes a line that contradicts itself — a receipt reading
  // "10.01 x 3 = 30.02". Mirrored in `convex-template/convex/orderRevise.ts`.
  const price = round2(item.price);

  return {
    menu_item_id: item.menuItemId,
    menu_item_name: item.menuItemName,
    quantity: item.quantity,
    price,
    subtotal: round2(price * item.quantity),
    special_instructions: item.specialInstructions ?? null,
    variation_selections: item.variationSelections ?? null,
    addons: item.addons ?? null,
  };
}

/**
 * Build every row an edit writes: the order patch, the replacement items, and
 * the audit snapshot.
 *
 * @throws if the edit is stale, empties the order, or carries an implausible
 * line. Throwing beats writing a defensible-looking but wrong bill.
 */
export function buildRevisionRows(
  tenantId: string,
  args: ReviseOrderArgs,
  previous: PreviousOrderState,
): {
  orderPatch: OrderRevisionPatch;
  itemRows: OrderItemRow[];
  revision: OrderRevisionRow;
} {
  if (args.expectedRevisionNumber !== previous.revisionNumber) {
    throw new Error(
      "This order changed while you were editing it — reopen it and try again.",
    );
  }

  if (args.items.length === 0) {
    throw new Error("An order cannot be emptied by editing. Cancel it instead.");
  }

  const itemRows = args.items.map(toItemRow);

  const itemsTotal = itemRows.reduce((sum, row) => sum + row.subtotal, 0);
  const total = round2(
    itemsTotal + (args.deliveryFee ?? 0) + (args.serviceChargeAmount ?? 0),
  );

  const revisionNumber = previous.revisionNumber + 1;

  return {
    orderPatch: {
      total,
      item_count: itemRows.reduce((sum, row) => sum + row.quantity, 0),
      revision_number: revisionNumber,
      edited_at: args.editedAt ?? null,
      edited_by: args.revisedBy ?? null,
    },
    itemRows,
    revision: {
      tenant_id: tenantId,
      order_id: args.orderId,
      revision_number: revisionNumber,
      items_before: previous.items,
      items_after: args.items,
      total_before: previous.total,
      total_after: total,
      reason: args.reason ?? null,
      revised_by: args.revisedBy ?? null,
      outlet_id: args.outletId ?? null,
    },
  };
}

// --- payments -------------------------------------------------------------

export interface RecordPaymentArgs {
  orderId: string;
  kind: "charge" | "refund";
  /** Always positive — {@link kind} carries the direction. */
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

export interface OrderPaymentRow {
  tenant_id: string;
  order_id: string;
  kind: "charge" | "refund";
  amount: number;
  payment_method_id: string | null;
  payment_method_name: string | null;
  reference: string | null;
  proof_url: string | null;
  proof_public_id: string | null;
  recorded_by: string | null;
  outlet_id: string | null;
  note: string | null;
}

/**
 * Build one settlement row.
 *
 * The amount is stored unsigned: a signed refund amount alongside
 * `kind = 'refund'` would double-negate and silently credit the customer
 * twice. The database enforces `amount > 0` too — this check exists to fail
 * with a message a cashier can act on rather than a constraint violation.
 */
export function buildPaymentRow(
  tenantId: string,
  args: RecordPaymentArgs,
): OrderPaymentRow {
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    throw new Error("A payment amount must be a positive number.");
  }

  const reference = args.reference?.trim();

  return {
    tenant_id: tenantId,
    order_id: args.orderId,
    kind: args.kind,
    amount: round2(args.amount),
    payment_method_id: args.paymentMethodId ?? null,
    payment_method_name: args.paymentMethodName ?? null,
    reference: reference ? reference : null,
    proof_url: args.proofUrl ?? null,
    proof_public_id: args.proofPublicId ?? null,
    recorded_by: args.recordedBy ?? null,
    outlet_id: args.outletId ?? null,
    note: args.note ?? null,
  };
}
