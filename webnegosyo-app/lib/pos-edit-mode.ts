/**
 * Editing a placed order inside the register.
 *
 * Order editing used to live on two screens of its own. It now runs on the POS
 * — the same product grid, the same modifier sheet, the same tender screen —
 * because a cashier correcting a bill is doing the same job as a cashier
 * ringing one up, and the standalone screens were a worse copy of the register.
 *
 * This module is the whole of the difference between the two modes. The screens
 * stay presentational: Jest is scoped to `lib/` and `theme/` in this app, so a
 * judgement made in `pos.tsx` or `pos-tender.tsx` is a judgement made untested.
 *
 * Pure and side-effect free — no clock, no network, no id generation.
 */

import {
  computeBalance,
  settlementIntent,
  type OrderPayment,
  type SettlementIntent,
} from "./order-balance";
import {
  hydratePosCart,
  posCartToOrderItems,
  type ModifierCatalog,
  type HydratableOrderItem,
  type RevisedOrderItem,
} from "./order-edit-cart";
import { canEditOrder, type EditGate } from "./order-edit-guards";
import { diffOrderItems } from "./order-revision";

import { revisedOrderTotal, type PosCartLine } from "./pos-cart";
import { readOrderDiscount, type OrderDiscountPayload } from "./order-discount";
import type { OrderDiscountLine } from "./order-totals";
import { repriceEditDiscount } from "./pos-edit-discount";
import type { Voucher } from "./vouchers/types";
import { buildPosStockItems, type PosStockItem } from "./pos-stock";
import type { OrderBackend } from "./order-backend";
import type { StaffPermissionHolder } from "./staff-permissions";
import type { BranchScope, ScopedOrderLike } from "./branch-scope";

/**
 * Everything the register needs to remember about the order it is editing,
 * beyond the cart itself.
 *
 * `deliveryFee` and `carriedCharges` are the reason this type exists. They
 * belong to the ORDER, not to the cart: the register derives a service charge
 * from the chosen order type and has no concept of delivery at all. Rebuilding
 * the total from the cart alone would quietly drop both.
 */
export interface OrderEditContext {
  orderId: string;
  /** Checked against the stored revision on save, to catch a concurrent edit. */
  expectedRevisionNumber: number;
  /** The bill as placed, for the was/now header. */
  originalTotal: number;
  /** The items as placed, for the dirty check and the audit snapshot. */
  originalItems: RevisedOrderItem[];
  /**
   * The items as placed, in the shape stock depletion needs — with option ids.
   *
   * Captured on load because once the edit begins the "before" is gone, and
   * {@link originalItems} cannot stand in: it names its modifiers but carries
   * no option ids, and an option's recipe is found by id.
   */
  originalStockItems: PosStockItem[];
  /** Carried across untouched; the register cannot recompute it. */
  deliveryFee: number;
  /**
   * Everything in the placed total that is neither a line item nor the
   * delivery fee — see {@link deriveCarriedCharges}.
   *
   * Travels to the revise mutation as its `serviceChargeAmount` argument,
   * which is the only channel available, but it is deliberately NOT named for
   * the service charge: the same residue also carries discounts and rounding.
   * May be negative.
   */
  carriedCharges: number;
  /** The settlement ledger as it stood when the register opened the order. */
  payments: OrderPayment[];
  /**
   * The discount as placed, when the order recorded a breakdown.
   *
   * Kept OUT of {@link carriedCharges} so it can be re-priced against the
   * edited cart without being deducted twice. Null for an order with no
   * recorded breakdown — there the residue is the only evidence a discount
   * happened, so it stays inside `carriedCharges` as before.
   */
  storedDiscount: OrderDiscountPayload | null;
  /**
   * The vouchers behind that discount, fetched by code.
   *
   * Null until the lookup returns — and null forever at a counter with no
   * signal, which is why `repriceEditDiscount` treats null as "carry the bill
   * as placed" rather than "no vouchers found".
   */
  discountVouchers: Voucher[] | null;
}

/** The order as the detail screen already has it. */
export interface EditableOrderLike {
  _id: string;
  total: number;
  revisionNumber?: number;
  deliveryFee?: number;
  items: HydratableOrderItem[];
  /**
   * Where the discount breakdown rides, per backend. Untyped on purpose —
   * `readOrderDiscount` is what shape-checks it. Omitting these at the call
   * site silently means "this order had no discount", so they must be passed.
   */
  customerData?: unknown;
  customer_data?: unknown;
  discount_data?: unknown;
}

export interface EnterEditModeRequest {
  /** The register's current cart. A counter sale in progress blocks the load. */
  cart: readonly PosCartLine[];
  status: string;
  backend: OrderBackend;
  user: StaffPermissionHolder;
  scope?: BranchScope;
  order?: ScopedOrderLike;
}

/**
 * Something the cashier can do, from this screen, about a refusal.
 *
 * Only refusals the person reading them can actually act on get one. A
 * delivered order and a missing permission are facts about the world; an open
 * counter sale is a state the same person can clear.
 */
export interface EditRemedy {
  action: "clear_register";
  /** Button copy. */
  label: string;
  /** Shown before acting — clearing discards a real customer's sale. */
  confirm: string;
}

export interface EnterEditGate extends EditGate {
  remedy?: EditRemedy;
}

const CLEAR_REGISTER_REMEDY: EditRemedy = {
  action: "clear_register",
  label: "Clear the register and edit",
  confirm:
    "The sale on the register will be discarded and this order opened for editing instead. This cannot be undone.",
};

/**
 * May the register open this order for editing right now?
 *
 * The status, permission, backend and branch rules are NOT re-implemented here.
 * They are {@link canEditOrder}'s, and the Convex and platform write paths
 * enforce the same set — a fourth copy would be a fourth thing to keep in step.
 *
 * The one rule this adds is the register's own: the cart is a single global
 * store shared with counter sales, so loading a placed order into a non-empty
 * one would fold a waiting customer's food into the bill being edited. The
 * cashier would not find out until the tender screen, after the rewrite.
 *
 * The order's own refusal is reported first. A delivered order cannot be edited
 * however tidy the register is, so asking the cashier to clear their sale would
 * waste the clearing.
 */
export function canEnterEditMode({
  cart,
  status,
  backend,
  user,
  scope,
  order,
}: EnterEditModeRequest): EnterEditGate {
  const gate = canEditOrder({ status, backend, user, scope, order });
  if (!gate.allowed) return gate;

  if (cart.length > 0) {
    return {
      allowed: false,
      reason:
        "The register has a sale in progress. Finish or clear it before editing an order.",
      remedy: CLEAR_REGISTER_REMEDY,
    };
  }

  return { allowed: true };
}

export interface EnteredEditMode {
  context: OrderEditContext;
  /** The order's items, as register cart lines. */
  cart: PosCartLine[];
  /** Items or modifiers no longer on the live menu, for the screen to warn on. */
  warnings: string[];
}

/**
 * Load a placed order into the register.
 *
 * Hydration is {@link hydratePosCart}'s: anything that no longer matches the
 * live menu is reported rather than dropped, and every line keeps the price it
 * was actually sold at.
 */
export function enterEditMode(
  order: EditableOrderLike,
  payments: readonly OrderPayment[],
  catalog: ModifierCatalog,
): EnteredEditMode {
  const { lines, unresolved } = hydratePosCart(order.items, catalog);
  // Zero, not undefined: `undefined + subtotal` is NaN, and the tender screen
  // would ask the cashier for "₱NaN".
  const deliveryFee = order.deliveryFee ?? 0;
  const storedDiscount = readOrderDiscount(order);

  return {
    cart: lines,
    context: {
      orderId: order._id,
      expectedRevisionNumber: order.revisionNumber ?? 0,
      originalTotal: order.total,
      originalItems: posCartToOrderItems(lines, catalog),
      originalStockItems: buildPosStockItems(lines),
      deliveryFee,
      carriedCharges: deriveCarriedCharges(order.total, lines, deliveryFee, storedDiscount),
      payments: [...payments],
      storedDiscount,
      // Fetched by the screen once the order is open; see `withEditVouchers`.
      discountVouchers: null,
    },
    warnings: unresolved.map((item) =>
      item.optionName
        ? `"${item.optionName}" on ${item.menuItemName} is no longer on the menu.`
        : `${item.menuItemName} is no longer on the menu.`,
    ),
  };
}

export interface EditModeTotals {
  /** The cart alone, before the carried fees. */
  itemsTotal: number;
  /** What the order is now worth, fees included. */
  newTotal: number;
  /**
   * What to send as the revise mutation's `serviceChargeAmount`.
   *
   * That argument is the only channel for everything which is neither line
   * items nor delivery, so the re-priced discount has to be folded into it.
   * Passing `carriedCharges` raw was correct only while the residue still
   * absorbed the discount; since it no longer does, the raw value would save a
   * bill the screen never showed and re-charge the customer their discount.
   */
  carriedChargesForSave: number;
  /** Positive: collect. Negative: refund. */
  balance: number;
  intent: SettlementIntent;
  isDirty: boolean;
  canSave: boolean;
  /**
   * What to store as the order's discount, for the revise mutation.
   *
   * `undefined` — nothing to say; leave whatever is stored alone. That is the
   * right default for the overwhelming majority of edits, which never touch a
   * discount, and blanking it every save would erase an original this code
   * never saw.
   * a payload   — this is the discount now, rows and total together.
   * `null`      — re-pricing dropped every line. Clear it, or the order shows
   *               a discount it no longer has.
   *
   * Derived from the same lines as {@link carriedChargesForSave}, so the rows
   * stored and the total stored can always be reconciled.
   */
  settledDiscount?: OrderDiscountPayload | null;
  /** Why saving is blocked, shown to the cashier verbatim. */
  blockedReason?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function itemsTotalOf(cart: readonly PosCartLine[]): number {
  return round2(cart.reduce((sum, line) => sum + line.subtotal, 0));
}

/**
 * The discount lines this edit ADDED, beyond what the order already carries.
 *
 * Two callers, one rule. `editModeTotals` sums these to price the bill, and the
 * tender screen burns them — and only them.
 *
 * A code already on the bill yields nothing either way. Re-entering one is an
 * easy mistake at a counter (the customer hands the same voucher over twice, or
 * the cashier does not recognise the label on the existing row): counting it
 * again gives away one discount for a voucher presented once, and burning it
 * again spends a second redemption from the customer's own allowance.
 *
 * A manual discount is excluded too — no code means nothing to redeem.
 */
export function newDiscountLines(
  added: readonly OrderDiscountLine[],
  carried: readonly OrderDiscountLine[],
): OrderDiscountLine[] {
  const alreadyOn = new Set(
    carried.map((line) => line.code).filter((code): code is string => code != null),
  );

  return added.filter(
    (line) =>
      Number.isFinite(line.amount) &&
      line.amount > 0 &&
      line.code != null &&
      !alreadyOn.has(line.code),
  );
}

/**
 * What this edit's own discount lines are worth.
 *
 * Manual lines are counted here but never burned: a cashier's open discount is
 * real money off the bill with no voucher behind it.
 */
function addedDiscountsOf(
  added: readonly OrderDiscountLine[],
  carried: readonly OrderDiscountLine[],
): number {
  const alreadyOn = new Set(
    carried.map((line) => line.code).filter((code): code is string => code != null),
  );

  return round2(
    added.reduce((sum, line) => {
      if (!Number.isFinite(line.amount) || line.amount <= 0) return sum;
      if (line.code != null && alreadyOn.has(line.code)) return sum;
      return sum + line.amount;
    }, 0),
  );
}

/**
 * The part of a placed bill that is neither its line items nor its delivery.
 *
 * Derived rather than read, because no backend stores it: the platform orders
 * table has no service-charge column and the Convex schema has no field. The
 * revise mutation accepts a `serviceChargeAmount` argument and folds it into
 * the total, but nothing persists it, so reading it back on a later edit
 * always yields nothing and the charge disappears from the bill.
 *
 * Recomputing it from the order type's rate would be worse than dropping it:
 * the rate may have changed since, and the residue is not only a service
 * charge — a discount or a rounding adjustment lands here too. Subtracting
 * what IS known preserves whatever the checkout actually did, whichever of
 * those it was.
 *
 * Not floored at zero: a negative residue is a discount the customer was
 * given, and clamping it would re-bill them for it.
 */
function deriveCarriedCharges(
  placedTotal: number,
  cart: readonly PosCartLine[],
  deliveryFee: number,
  storedDiscount: OrderDiscountPayload | null,
): number {
  // A recorded discount is added back, because it is re-priced separately
  // against the edited cart. Left in, it would come off twice: once inside
  // this residue and again as a discount line.
  const recorded = storedDiscount?.total ?? 0;
  return round2(placedTotal - itemsTotalOf(cart) - deliveryFee + recorded);
}

/**
 * Attaches the vouchers behind a stored discount, once they have been fetched.
 *
 * A pure updater rather than a mutation, so the edit context stays a value the
 * screen can hold in state. Null stays null when the lookup fails — that is
 * the signal to carry the bill as placed.
 */
export function withEditVouchers(
  context: OrderEditContext,
  vouchers: Voucher[] | null,
): OrderEditContext {
  return { ...context, discountVouchers: vouchers };
}

/**
 * What the edited order is worth, and what the cashier owes or is owed.
 *
 * The single place the carried fees are re-applied, so there is one answer to
 * "what does this order cost now" rather than one per screen.
 */
export function editModeTotals(
  cart: readonly PosCartLine[],
  context: OrderEditContext,
  addedDiscountLines: readonly OrderDiscountLine[] = [],
): EditModeTotals {
  const itemsTotal = itemsTotalOf(cart);

  // Re-priced against the edited cart, per the owner's decision: remove the
  // item a voucher qualified for and the discount goes with it. Until the
  // lookup returns, `discountVouchers` is null and the bill as placed is
  // carried — showing full price for a moment and then dropping would read as
  // a price that changed itself.
  const discount = repriceEditDiscount({
    stored: context.storedDiscount,
    vouchers: context.discountVouchers,
    cart,
    // The residue is whatever the placed bill carried beyond items and
    // delivery, which is the register's stand-in for a service charge here.
    serviceCharge: context.carriedCharges + context.deliveryFee,
    // Passed separately as well, and NOT double-counted: above it is part of
    // the chargeable cap, here it is the thing a free-delivery voucher
    // discounts. A delivery order edited without it lost that voucher.
    deliveryFee: context.deliveryFee,
    now: new Date(),
  });

  // A code the cashier applied during THIS edit, on top of whatever the order
  // already carried. Capped against the two together rather than separately:
  // two lines that each fit under the bill can still sum past it, and a
  // negative total is money invented.
  const chargeable = round2(itemsTotal + context.carriedCharges + context.deliveryFee);
  const added = addedDiscountsOf(addedDiscountLines, discount.lines);
  const discountTotal = Math.min(round2(discount.total + added), Math.max(chargeable, 0));

  // Folded once, here, so the shown total and the saved one cannot disagree:
  // `revisedOrderTotal(items, delivery, carriedChargesForSave)` reproduces
  // `newTotal` exactly, which is what the revise mutation recomputes.
  const carriedChargesForSave = round2(context.carriedCharges - discountTotal);

  const settledLines = [
    ...discount.lines,
    ...newDiscountLines(addedDiscountLines, discount.lines),
  ];
  const settledDiscount = settledDiscountOf(
    settledLines,
    discountTotal,
    context.storedDiscount,
  );
  const newTotal = revisedOrderTotal(
    itemsTotal,
    context.deliveryFee,
    carriedChargesForSave,
  );

  const balance = computeBalance(newTotal, context.payments);

  // Same identity rule the revision diff uses, so "is this dirty?" and "what
  // changed?" can never disagree — an enabled Save button beside an empty
  // change list is a bug the cashier cannot explain.
  // Applying a code moves no line, so the item diff alone would leave Save
  // disabled on an edit whose only point was the discount.
  const isDirty =
    diffOrderItems(context.originalItems, posCartToOrderItems(cart)).length > 0 ||
    added > 0;

  const blockedReason =
    cart.length === 0
      ? "An order cannot be emptied by editing. Cancel it instead."
      : undefined;

  return {
    itemsTotal,
    newTotal,
    carriedChargesForSave,
    balance,
    intent: settlementIntent(balance),
    isDirty,
    canSave: isDirty && !blockedReason,
    ...(blockedReason ? { blockedReason } : {}),
    ...(settledDiscount !== undefined ? { settledDiscount } : {}),
  };
}

/**
 * Turn the settled lines into a payload to store — or into the decision not to.
 *
 * Silence (`undefined`) when there was nothing before and nothing now, so an
 * ordinary edit does not write a discount key onto an order that never had one.
 * `null` when the order HAD a discount and now has none, which is a real change
 * and has to be distinguishable from silence.
 */
function settledDiscountOf(
  lines: readonly OrderDiscountLine[],
  total: number,
  stored: OrderDiscountPayload | null,
): OrderDiscountPayload | null | undefined {
  if (lines.length === 0) return stored ? null : undefined;

  return {
    total,
    // Delivery is discounted through a free-delivery voucher, which carries no
    // line of its own; the register cannot attribute it, so it is not claimed.
    deliveryDiscount: stored?.deliveryDiscount ?? 0,
    lines: lines.map((line) => ({
      label: line.label,
      amount: line.amount,
      ...(line.code != null ? { code: line.code } : {}),
      ...(line.voucherId != null ? { voucherId: line.voucherId } : {}),
    })),
    // Per-line allocation is the checkout's; the register has no equivalent.
    allocationsByLine: {},
  };
}
