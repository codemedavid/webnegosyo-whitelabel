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
}: EnterEditModeRequest): EditGate {
  const gate = canEditOrder({ status, backend, user, scope, order });
  if (!gate.allowed) return gate;

  if (cart.length > 0) {
    return {
      allowed: false,
      reason:
        "The register has a sale in progress. Finish or clear it before editing an order.",
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
  /** Positive: collect. Negative: refund. */
  balance: number;
  intent: SettlementIntent;
  isDirty: boolean;
  canSave: boolean;
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
    now: new Date(),
  });

  const newTotal = round2(
    revisedOrderTotal(itemsTotal, context.deliveryFee, context.carriedCharges) -
      discount.total,
  );

  const balance = computeBalance(newTotal, context.payments);

  // Same identity rule the revision diff uses, so "is this dirty?" and "what
  // changed?" can never disagree — an enabled Save button beside an empty
  // change list is a bug the cashier cannot explain.
  const isDirty =
    diffOrderItems(context.originalItems, posCartToOrderItems(cart)).length > 0;

  const blockedReason =
    cart.length === 0
      ? "An order cannot be emptied by editing. Cancel it instead."
      : undefined;

  return {
    itemsTotal,
    newTotal,
    balance,
    intent: settlementIntent(balance),
    isDirty,
    canSave: isDirty && !blockedReason,
    ...(blockedReason ? { blockedReason } : {}),
  };
}
