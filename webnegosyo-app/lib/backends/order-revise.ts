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

import { revisedOrderTotal } from "../pos-cart";
import type { OrderDiscountPayload } from "../order-discount";
import type { OrderAddon, OrderVariationSelection } from "./supabase-orders";
import { toAddonColumn } from "./addon-columns";
import { toUuidOrNull } from "../uuid";

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
  /**
   * Legacy variation string and bundle/upsell markers, carried through the
   * rewrite verbatim. The edit rewrites items by delete-and-reinsert, so a
   * quantity change that omitted these would strip "(Large)" off the chit of
   * a web-created order and unlink its bundle lines.
   */
  variation?: string;
  isUpsellItem?: boolean;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
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
  /**
   * The NAMED service charge, stored so the row can be captioned.
   *
   * Distinct from `serviceChargeAmount` above, which is this edit's single
   * money channel and also carries the re-priced discount and any rounding
   * residue. The total is built from that one alone; adding this as well would
   * bill the service twice. A record, exactly like `discount` below.
   *
   * Three states, matching `discount`:
   *   `undefined` — the caller predates the field; leave the stored charge be.
   *   a positive  — this is the charge now.
   *   `0`         — the edit left no charge; the column is blanked.
   */
  serviceCharge?: number;
  reason?: string;
  revisedBy?: string;
  outletId?: string;
  /** ISO timestamp, supplied by the caller so retries stay idempotent. */
  editedAt?: string;
  /**
   * The discount this edit settled on, as a record of what was decided.
   *
   * Three distinct states, and they must stay distinct:
   *   `undefined` — the edit did not touch the discount. The stored one is
   *                 kept, because most edits do not touch it and blanking it
   *                 on every save would erase the original.
   *   a payload   — this is the discount now. Replaces the stored one.
   *   `null`      — the edit settled on NO discount. Clears the stored one,
   *                 so an order does not keep rows for a voucher that no
   *                 longer applies.
   *
   * The TOTAL is still computed from `serviceChargeAmount`, never from this.
   * Deducting it here as well would take the discount off twice.
   */
  discount?: OrderDiscountPayload | null;
}

/** The order as it stands before this edit. */
export interface PreviousOrderState {
  revisionNumber: number;
  /** Absent only in callers that predate the kitchen-started rule. */
  status?: string;
  total: number;
  items: ReviseOrderItem[];
}

/**
 * Statuses past the point of editing, keyed to the message the cashier sees.
 *
 * The line is drawn where the kitchen starts: up to `confirmed` nothing has
 * been cooked and a correction costs nothing, but from `preparing` the ticket
 * is on the line and the stock has already moved against the original items.
 *
 * Duplicated deliberately in `lib/order-edit-guards.ts` (the screen gate) and
 * `convex-template/convex/orderRevise.ts` (the Convex write path), the same
 * arrangement `staff-permissions.ts` uses. All three must agree, or a
 * merchant's protection depends on which backend they happen to be on.
 */
const UNEDITABLE_STATUSES: Record<string, string> = {
  preparing:
    "The kitchen has already started this order, so it can no longer be edited.",
  ready: "This order is ready for handover and can no longer be edited.",
  delivered: "This order was already delivered and can no longer be edited.",
  cancelled: "This order was cancelled and can no longer be edited.",
};

export interface OrderRevisionPatch {
  total: number;
  /**
   * The fee the new total was computed WITH. Written on every revision so the
   * breakdown column can never disagree with the bill — the original defect
   * here was a total built from `args.deliveryFee` beside a column still
   * holding the old figure. Null (not 0) for a fee-less order, matching the
   * create path.
   */
  delivery_fee: number | null;
  /**
   * The named service charge. Written only when the edit had something to say
   * about it, so an old app build cannot blank a charge it never knew about.
   */
  service_charge_amount?: number | null;
  item_count: number;
  revision_number: number;
  edited_at: string | null;
  edited_by: string | null;
  /** Present only when the edit settled a discount — see ReviseOrderArgs. */
  discount_data?: OrderDiscountPayload | null;
}

export interface OrderItemRow {
  /**
   * NULLABLE, because the column is: `menu_item_id uuid references
   * menu_items(id) on delete set null`. A line whose product was deleted is
   * already null in the database, and the edit screen hands that back as `""`
   * (`order-edit-cart.ts` keys the cart line on `menuItemId ?? ""`). Postgres
   * refuses `''` for a uuid with 22P02 — see {@link toItemRow}.
   */
  menu_item_id: string | null;
  menu_item_name: string;
  quantity: number;
  price: number;
  subtotal: number;
  special_instructions: string | null;
  variation_selections: OrderVariationSelection[] | null;
  /** Addon NAMES — the platform column is `text[] NOT NULL`. See `addon-columns.ts`. */
  addons: string[];
  variation: string | null;
  is_upsell_item: boolean;
  is_bundle_item: boolean;
  bundle_id: string | null;
  bundle_name: string | null;
  slot_name: string | null;
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
    // Coerced, never passed through. `""` — what the edit screen produces for a
    // line whose menu item was deleted — is not a uuid, and the revise path
    // REPLACES an order's items, so this one refusal used to leave a live order
    // with no line items at all. Null is what the column already holds for such
    // a line, so writing it loses nothing; the submitted id is kept verbatim in
    // the audit snapshot.
    menu_item_id: toUuidOrNull(item.menuItemId),
    menu_item_name: item.menuItemName,
    quantity: item.quantity,
    price,
    subtotal: round2(price * item.quantity),
    special_instructions: item.specialInstructions ?? null,
    variation_selections: item.variationSelections ?? null,
    addons: toAddonColumn(item.addons),
    variation: item.variation ?? null,
    is_upsell_item: item.isUpsellItem === true,
    is_bundle_item: item.isBundleItem === true,
    bundle_id: item.bundleId ?? null,
    bundle_name: item.bundleName ?? null,
    slot_name: item.slotName ?? null,
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
  // Reported before the stale-revision check: a started ticket stays
  // uneditable however many times it is reopened, so "reopen and try again"
  // would send the cashier round a loop that never ends.
  const statusRefusal = previous.status
    ? UNEDITABLE_STATUSES[previous.status]
    : undefined;
  if (statusRefusal) throw new Error(statusRefusal);

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
  // Shared with the was/now header the cashier just confirmed. `carriedCharges`
  // arrives as `serviceChargeAmount` because that is the only argument the
  // revise mutation has, but it also carries discounts — see revisedOrderTotal.
  const total = revisedOrderTotal(
    itemsTotal,
    args.deliveryFee ?? 0,
    args.serviceChargeAmount ?? 0,
  );

  const revisionNumber = previous.revisionNumber + 1;

  const deliveryFee = args.deliveryFee ?? 0;

  return {
    orderPatch: {
      total,
      delivery_fee: deliveryFee > 0 ? round2(deliveryFee) : null,
      // Spread, so the key is ABSENT when the caller sent nothing — the same
      // rule discount_data follows below, and for the same reason.
      ...(args.serviceCharge !== undefined
        ? {
            service_charge_amount:
              args.serviceCharge > 0 ? round2(args.serviceCharge) : null,
          }
        : {}),
      item_count: itemRows.reduce((sum, row) => sum + row.quantity, 0),
      revision_number: revisionNumber,
      edited_at: args.editedAt ?? null,
      edited_by: args.revisedBy ?? null,
      // Spread rather than set: the key must be ABSENT when the edit did not
      // settle a discount, so the update leaves the stored one alone. Writing
      // `undefined` would serialise as a blanking on some clients.
      ...(args.discount !== undefined ? { discount_data: args.discount } : {}),
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
