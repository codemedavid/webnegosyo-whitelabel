import { cartTotals, round2, type PosCartLine } from "./pos-cart";
import { discountLineItems, type OrderDiscountPayload } from "./order-discount";
import type { DiscountLineItem, OrderDiscountLine } from "./order-totals";
import { applyPosVouchers, posDiscountContext } from "./pos-discount";
import type {
  DiscountContext,
  UnitPicks,
  Voucher,
  VoucherRejectionReason,
} from "./vouchers/types";

/**
 * What happens to a discount when a placed order is edited.
 *
 * DECIDED BY THE OWNER: the discount is RE-PRICED. Remove the item a voucher
 * qualified for and the discount goes with it, rather than riding along as an
 * amount with no rule behind it.
 *
 * The distinction that makes that safe is WHICH rules are re-checked.
 *
 * CART rules are re-checked — scope, minimum spend, what a percentage is a
 * percentage of. They describe the order, and the order just changed. That is
 * the entire point of the decision.
 *
 * LIFECYCLE rules are not. A voucher that has since expired, been retired, or
 * hit its usage limit was validly used at the time of sale; stripping it during
 * an unrelated edit would re-bill a customer for a discount they were
 * legitimately given, for a reason nobody at the counter could explain.
 *
 * A MANUAL discount is always carried forward. A person decided that amount for
 * a written reason, and there is no rule to re-evaluate. An ITEM discount is
 * carried per unit of its dish: it follows the dish to its new position, keeps
 * only the units still on the order, and goes when the dish goes.
 *
 * When the vouchers could not be fetched at all — a counter with no signal —
 * the vouchers are carried forward as placed. Charging a customer more than
 * they agreed because the wifi dropped is the worse failure.
 */

export interface EditDiscountInput {
  /** The discount as placed. */
  stored: OrderDiscountPayload | null;
  /** Fetched by code. `null` means the lookup failed — NOT "none found". */
  vouchers: readonly Voucher[] | null;
  cart: readonly PosCartLine[];
  serviceCharge: number;
  /**
   * The order's own delivery fee, so a free-delivery voucher still has
   * something to discount. Zero — the counter-sale default — makes the engine
   * reject one as `no_delivery_fee`, which drops it.
   *
   * Deliberately NOT added to `serviceCharge`: that argument is the chargeable
   * cap, and `editModeTotals` already folds delivery into it. Counting the fee
   * twice would raise the cap and let a discount exceed the bill.
   */
  deliveryFee?: number;
  now: Date;
  outletId?: string | null;
}

export interface EditDiscount {
  lines: readonly OrderDiscountLine[];
  total: number;
  /** False when the stored discount was carried forward unexamined. */
  isRepriced: boolean;
}

/**
 * Rejections that mean "this no longer fits THIS order".
 *
 * Only these drop a voucher. Everything else the engine can say is about the
 * voucher's own life, not about the sale being edited.
 */
const CART_DEPENDENT_REASONS: readonly VoucherRejectionReason[] = [
  "no_matching_items",
  "below_minimum",
  "no_value",
  "no_delivery_fee",
];

const EMPTY: EditDiscount = { lines: [], total: 0, isRepriced: false };

/**
 * A cashier's item discount against the edited cart. Each dish (named by cart
 * key, see `cartKeyedDiscount`) keeps its per-unit amount: a dish no longer on
 * the order takes its share with it, and a dish whose quantity dropped keeps
 * only the units still there. Null when every dish it was given on is gone.
 * A discount without dishes (the whole-order kind) is carried as placed.
 */
function carriedManualLine(storedLine: OrderDiscountLine, cart: readonly PosCartLine[]): OrderDiscountLine | null {
  const placed = discountLineItems(storedLine);
  if (placed.length === 0) return { label: storedLine.label, amount: storedLine.amount };

  const quantityByKey = new Map(cart.map((line) => [line.key, Math.floor(line.quantity)]));
  const items: DiscountLineItem[] = placed.flatMap((item) => {
    const units = Math.min(item.units, quantityByKey.get(item.lineKey) ?? 0);
    if (units <= 0) return [];
    return [{ lineKey: item.lineKey, units, amount: Math.round((item.amount * 100 * units) / item.units) / 100 }];
  });
  if (items.length === 0) return null;

  // Whatever the line held beyond its dishes (none, for an item discount) rides along.
  const placedCents = placed.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  const keptCents = items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  const amount = Math.max(0, Math.round(storedLine.amount * 100) - placedCents + keptCents) / 100;
  return { label: storedLine.label, amount, items };
}

/**
 * The dishes each stored unit-limited voucher was given on, as picks for the
 * engine — so an edit keeps the dish the cashier or customer chose instead of
 * sliding back to the cheapest units. A pick that no longer fits the edited
 * cart is ignored by the engine, which then takes the cheapest units.
 */
function storedUnitPicks(stored: OrderDiscountPayload): Record<string, UnitPicks> {
  const picks: Record<string, UnitPicks> = {};
  for (const line of stored.lines) {
    const items = discountLineItems(line);
    if (!line.code || items.length === 0) continue;
    picks[line.code] = Object.fromEntries(items.map((item) => [item.lineKey, item.units]));
  }
  return picks;
}

/**
 * Can the register actually judge this voucher's scope against this cart?
 *
 * A `no_matching_items` rejection is only a verdict when the register holds the
 * facts the scope is written in. It holds menu item ids on every line, so a
 * product-scoped voucher really can be judged. It holds no CATEGORY at all — a
 * register cart line is item, options, price — so a category-scoped voucher is
 * rejected for matching nothing regardless of what the cart contains.
 *
 * That is ignorance, not disqualification, and dropping the line on it re-bills
 * a customer a discount they were legitimately given. So the placed bill is
 * carried, which is the same direction the offline (`vouchers === null`) rule
 * already takes when the register cannot answer the question.
 *
 * Written as a fact about the LINES rather than a blanket exemption for
 * category vouchers: the day a register line carries its category, this tightens
 * back into a real re-price on its own.
 */
function canJudgeScope(voucher: Voucher | undefined, context: DiscountContext): boolean {
  if (!voucher || voucher.scope !== "categories") return true;
  return context.lines.some((line) => line.categoryId != null);
}

/**
 * The bill as placed, for when the vouchers could not be looked up — which is
 * also every order whose discounts are all the cashier's own (no code, so the
 * screen never looks anything up). Vouchers ride as placed; a cashier's item
 * discount still follows its dish, which needs no lookup.
 */
function carryForward(
  stored: OrderDiscountPayload,
  chargeable: number,
  cart: readonly PosCartLine[],
): EditDiscount {
  const lines = stored.lines
    .filter((line) => Number.isFinite(line.amount) && line.amount > 0)
    .flatMap((line) => {
      if (line.code) return [line];
      const carried = carriedManualLine(line, cart);
      return carried ? [carried] : [];
    });
  const total = Math.min(
    round2(lines.reduce((sum, line) => sum + line.amount, 0)),
    chargeable,
  );

  return { lines, total, isRepriced: false };
}

export function repriceEditDiscount(input: EditDiscountInput): EditDiscount {
  const { stored, vouchers, cart, serviceCharge, deliveryFee, now, outletId } = input;

  if (!stored || stored.lines.length === 0) return EMPTY;

  // `cartTotals` owns this arithmetic; a second implementation of
  // subtotal + charge is what the money-wiring guardrail exists to prevent.
  const { total: chargeable } = cartTotals([...cart], {
    type: "fixed",
    value: serviceCharge,
  });

  if (chargeable <= 0) return EMPTY;

  // Could not ask. Carry the bill as placed rather than invent a new one.
  if (vouchers === null) return carryForward(stored, chargeable, cart);

  const context = posDiscountContext(
    cart,
    serviceCharge,
    now,
    outletId,
    deliveryFee ?? 0,
    storedUnitPicks(stored),
  );
  const application = applyPosVouchers(vouchers, context);

  const lines: OrderDiscountLine[] = [];

  for (const storedLine of stored.lines) {
    if (!Number.isFinite(storedLine.amount) || storedLine.amount <= 0) continue;

    // No code means a cashier's open discount. No rule to re-evaluate, but an
    // item discount follows its dish (see `carriedManualLine`).
    if (!storedLine.code) {
      const carried = carriedManualLine(storedLine, cart);
      if (carried) lines.push(carried);
      continue;
    }

    const repriced = application.discountLines.find(
      (line) => line.code === storedLine.code,
    );
    if (repriced) {
      lines.push(repriced);
      continue;
    }

    const rejection = application.rejected.find(
      (entry) => entry.voucherId === storedLine.voucherId,
    );

    // Dropped only when the EDITED CART is what disqualified it. A lifecycle
    // rejection, or a voucher that can no longer be found, keeps the line the
    // customer was originally given — and so does a scope the register has no
    // facts to evaluate.
    if (rejection && CART_DEPENDENT_REASONS.includes(rejection.reason)) {
      const isBlind =
        rejection.reason === "no_matching_items" &&
        !canJudgeScope(
          vouchers.find((voucher) => voucher.id === storedLine.voucherId),
          context,
        );
      if (!isBlind) continue;
    }

    lines.push({
      label: storedLine.label,
      amount: storedLine.amount,
      voucherId: storedLine.voucherId,
      code: storedLine.code,
    });
  }

  const total = Math.min(
    round2(lines.reduce((sum, line) => sum + line.amount, 0)),
    chargeable,
  );

  return { lines, total, isRepriced: true };
}
