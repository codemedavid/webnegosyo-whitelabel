/**
 * The state behind the edit screen: what the order was, what it is now, and
 * what the cashier has to do about the difference.
 *
 * The edit and settle screens are deliberately thin over this. Jest is scoped
 * to `lib/` in this app, so anything worth proving has to live here rather
 * than in a component — and "did we ask the cashier for the right amount" is
 * very much worth proving.
 *
 * Every function returns a NEW session; nothing is mutated, so React state can
 * be swapped atomically.
 */

import { computeBalance, settlementIntent, type OrderPayment, type SettlementIntent } from "./order-balance";
import {
  hydratePosCart,
  posCartToOrderItems,
  type ModifierCatalog,
  type RevisedOrderItem,
} from "./order-edit-cart";
import { describeChange, diffOrderItems } from "./order-revision";
import type { OrderItemDto } from "./backends/supabase-orders";
import type { PosCartLine } from "./pos-cart";

/** The order being edited, as the detail screen already has it. */
export interface EditableOrder {
  _id: string;
  total: number;
  revisionNumber?: number;
  items: OrderItemDto[];
}

export interface EditSession {
  orderId: string;
  /** Checked against the stored revision on save, to catch a concurrent edit. */
  expectedRevisionNumber: number;
  /** The bill as placed — kept for the "was / now" header. */
  originalTotal: number;
  originalItems: RevisedOrderItem[];
  /** The register cart the screen renders and mutates. */
  cart: PosCartLine[];
  newTotal: number;
  /** Positive: collect. Negative: refund. */
  balance: number;
  intent: SettlementIntent;
  isDirty: boolean;
  canSave: boolean;
  /** Why saving is blocked, for the screen to show. */
  blockedReason?: string;
  /** Items or modifiers no longer on the live menu. */
  warnings: string[];
  payments: OrderPayment[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function cartTotal(cart: readonly PosCartLine[]): number {
  return round2(cart.reduce((sum, line) => sum + line.subtotal, 0));
}

/**
 * Same identity rule the revision diff uses, so "is this dirty?" and "what
 * changed?" can never disagree — a screen showing an enabled Save button with
 * an empty change list would be a bug the cashier cannot explain.
 */
function isUnchanged(before: RevisedOrderItem[], after: RevisedOrderItem[]): boolean {
  return diffOrderItems(before, after).length === 0;
}

function settle(
  session: Omit<EditSession, "balance" | "intent" | "isDirty" | "canSave" | "blockedReason">,
): EditSession {
  const balance = computeBalance(session.newTotal, session.payments);
  const after = posCartToOrderItems(session.cart);
  const isDirty = !isUnchanged(session.originalItems, after);

  const blockedReason =
    session.cart.length === 0
      ? "An order cannot be emptied by editing. Cancel it instead."
      : undefined;

  return {
    ...session,
    balance,
    intent: settlementIntent(balance),
    isDirty,
    canSave: isDirty && !blockedReason,
    ...(blockedReason ? { blockedReason } : {}),
  };
}

/**
 * Open an order for editing.
 *
 * `payments` is the settlement ledger; an order with none has been billed but
 * not paid, so it opens owing its full total rather than looking settled.
 */
export function startEditSession(
  order: EditableOrder,
  payments: readonly OrderPayment[],
  catalog: ModifierCatalog,
): EditSession {
  const { lines, unresolved } = hydratePosCart(order.items, catalog);

  return settle({
    orderId: order._id,
    expectedRevisionNumber: order.revisionNumber ?? 0,
    originalTotal: order.total,
    originalItems: posCartToOrderItems(lines, catalog),
    cart: lines,
    newTotal: cartTotal(lines),
    warnings: unresolved.map((item) =>
      item.optionName
        ? `"${item.optionName}" on ${item.menuItemName} is no longer on the menu.`
        : `${item.menuItemName} is no longer on the menu.`,
    ),
    payments: [...payments],
  });
}

/** Swap in the cart the register produced and re-settle the money. */
export function applyCart(session: EditSession, cart: PosCartLine[]): EditSession {
  return settle({
    ...session,
    cart: [...cart],
    newTotal: cartTotal(cart),
  });
}

/** What changed, in words a merchant can read back. */
export function describeSession(session: EditSession): string[] {
  return diffOrderItems(session.originalItems, posCartToOrderItems(session.cart)).map(
    describeChange,
  );
}
