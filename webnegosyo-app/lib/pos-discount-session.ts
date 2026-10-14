import { cartTotals, round2, type PosCartLine } from "./pos-cart";
import type { OrderDiscountLine } from "./order-totals";
import type { StaffPermissionHolder } from "./staff-permissions";
import {
  applyPosVouchers,
  manualDiscountLine,
  posDiscountContext,
  priceItemDiscounts,
  validateManualDiscount,
  validateManualItemDiscount,
  type ManualDiscount,
  type ManualItemDiscount,
} from "./pos-discount";
import type { RejectedVoucher } from "./vouchers/stacking";
import { unitLimitOf } from "./vouchers/discount";
import { getEligibleLines } from "./vouchers/eligibility";
import type { UnitPicks, Voucher } from "./vouchers/types";
import { chooseDiscountRegime, type RegimeChoice } from "./gov-discount";
import {
  EMPTY_GOV_SESSION,
  govSessionAfterCartChange,
  priceGovSession,
  type PosGovContext,
  type PosGovPricing,
  type PosGovSession,
  type PosGovState,
} from "./pos-gov-discount";

/**
 * What the register is holding while a sale is being rung.
 *
 * This is the counter's answer to the checkout's `checkout-codes.ts`, and it
 * differs in one deliberate way.
 *
 * Online, a cart change INVALIDATES the discount: the browser blanks the
 * preview and re-asks the server, because the server is the only thing that
 * can price a code. At the counter the engine is local and byte-identical to
 * the server's, so a cart change simply RE-PRICES. There is no stale window to
 * guard against, and no "checking…" state to sit in front of a queue.
 *
 * The state therefore holds INPUTS only — the vouchers presented and the
 * manual discount given — and never a computed total. `sessionDiscount` is
 * derived, called fresh against whatever the cart currently is. A voucher that
 * stops qualifying when a line is voided stops applying immediately, which is
 * the behaviour that matters: billing a discount whose rule no longer holds is
 * money given away with nothing behind it.
 */

export interface PosDiscountSession {
  /** Entry order preserved: it decides a solo-only conflict. */
  vouchers: readonly Voucher[];
  /** The cashier's open discount, if one was given. */
  manual: ManualDiscount | null;
  /** Discounts on one dish each ("1 of 5 fries"), at most one per line. Absent = none. */
  itemDiscounts?: readonly ManualItemDiscount[];
  /**
   * Which units each unit-limited voucher lands on, as the cashier chose:
   * voucher code → cart line key → units. Absent = the cheapest units.
   */
  unitPicks?: Readonly<Record<string, UnitPicks>>;
  /**
   * Senior Citizen / PWD claimants for this sale — see `pos-gov-discount.ts`.
   * Absent is the same as none.
   */
  government?: PosGovSession;
}

export interface PosSessionDiscount {
  lines: readonly OrderDiscountLine[];
  total: number;
  /** Why a presented voucher was refused, so the cashier can say. */
  rejected: readonly RejectedVoucher[];
  /** The Senior/PWD side of the sale, whether or not it won. */
  government: PosGovState;
  /**
   * Which side the sale uses when both a government discount and the store's
   * own (vouchers / manual) are present — never both (RA 9994 §4). Null when
   * only one side exists.
   */
  regime: RegimeChoice | null;
}

export const EMPTY_POS_DISCOUNT_SESSION: PosDiscountSession = {
  vouchers: [],
  manual: null,
  government: EMPTY_GOV_SESSION,
};

/**
 * Holds a voucher for this sale.
 *
 * Ignores a code already applied — a cashier tapping Apply twice must not
 * double the discount.
 */
export function addSessionVoucher(
  session: PosDiscountSession,
  voucher: Voucher,
): PosDiscountSession {
  if (session.vouchers.some((held) => held.code === voucher.code)) return session;

  return { ...session, vouchers: [...session.vouchers, voucher] };
}

/**
 * What the sale is still holding after the cart changed.
 *
 * An emptied cart is the end of a sale, and its discounts end with it. The
 * Clear button already knew that; the − stepper did not, because
 * `updateQty(key, 0)` REMOVES the line, so the register reaches zero lines
 * without anything having called `reset()`. A voucher surviving that is applied
 * to the NEXT customer — money given to somebody who presented no code, shown
 * only inside the cart sheet's collapsed totals as a quietly-low Charge.
 *
 * Returns the same session object untouched while the sale is still alive, so
 * the store's state identity does not churn on every quantity tap.
 */
export function discountAfterCartChange(
  session: PosDiscountSession,
  cart: readonly PosCartLine[],
): PosDiscountSession {
  if (cart.length === 0) return EMPTY_POS_DISCOUNT_SESSION;
  const withItems = itemDiscountsAfterCartChange(session, cart);
  if (!withItems.government) return withItems;
  const government = govSessionAfterCartChange(withItems.government, cart);
  return government === withItems.government ? withItems : { ...withItems, government };
}

/** An item discount leaves with its line; a shrunken line is trimmed at pricing. */
function itemDiscountsAfterCartChange(
  session: PosDiscountSession,
  cart: readonly PosCartLine[],
): PosDiscountSession {
  const held = session.itemDiscounts ?? [];
  const kept = held.filter((discount) => cart.some((line) => line.key === discount.lineKey));
  return kept.length === held.length ? session : { ...session, itemDiscounts: kept };
}

/**
 * Records a cashier's discount on one dish, replacing any earlier one on the
 * same line, or refuses it (same gate as the whole-order discount).
 */
export function setSessionItemDiscount(
  session: PosDiscountSession,
  discount: ManualItemDiscount,
  user?: StaffPermissionHolder,
): PosDiscountSession {
  const holder: StaffPermissionHolder =
    user ?? ({ role: "admin", isOwner: true, permissions: null } as StaffPermissionHolder);
  if (!validateManualItemDiscount(discount, holder).isAllowed) return session;

  const others = (session.itemDiscounts ?? []).filter((held) => held.lineKey !== discount.lineKey);
  return { ...session, itemDiscounts: [...others, { ...discount, reason: discount.reason.trim() }] };
}

export function removeSessionItemDiscount(
  session: PosDiscountSession,
  lineKey: string,
): PosDiscountSession {
  const held = session.itemDiscounts ?? [];
  const kept = held.filter((discount) => discount.lineKey !== lineKey);
  return kept.length === held.length ? session : { ...session, itemDiscounts: kept };
}

/** Which units a unit-limited voucher lands on (empty picks = back to the cheapest). */
export function setSessionUnitPicks(
  session: PosDiscountSession,
  code: string,
  picks: UnitPicks,
): PosDiscountSession {
  const key = code.trim().toUpperCase();
  const chosen = Object.fromEntries(Object.entries(picks).filter(([, units]) => units > 0));
  const { [key]: _previous, ...rest } = session.unitPicks ?? {};
  return {
    ...session,
    unitPicks: Object.keys(chosen).length > 0 ? { ...rest, [key]: chosen } : rest,
  };
}

/** One applied unit-limited voucher, for the "Applies to … · Change" picker. */
export interface VoucherUnitChoice {
  code: string;
  name: string;
  /** How many units the voucher may discount in total. */
  limit: number;
  /** Every line the voucher may land on, with how many units it is on now. */
  lines: { lineKey: string; name: string; quantity: number; chosen: number }[];
}

/** The unit-limited vouchers on this sale, the dishes each may hit, and where each is now. */
export function voucherUnitChoices(
  session: PosDiscountSession,
  cart: readonly PosCartLine[],
  serviceCharge: number,
  now: Date,
  outletId?: string | null,
  deliveryFee = 0,
): VoucherUnitChoice[] {
  const priced = sessionDiscount(session, cart, serviceCharge, now, outletId, deliveryFee);
  const context = posDiscountContext(cart, serviceCharge, now, outletId, deliveryFee);
  return session.vouchers.flatMap((voucher) => {
    const limit = unitLimitOf(voucher);
    const applied = priced.lines.find((line) => line.code === voucher.code);
    if (limit === null || !applied) return [];
    const eligible = getEligibleLines(voucher, context.lines);
    return [
      {
        code: voucher.code,
        name: voucher.name || voucher.code,
        limit,
        lines: eligible.map((line) => ({
          lineKey: line.id,
          name: cart.find((entry) => entry.key === line.id)?.name ?? "Item",
          quantity: Math.max(1, Math.floor(line.quantity)),
          chosen: applied.items?.find((item) => item.lineKey === line.id)?.units ?? 0,
        })),
      },
    ];
  });
}

export function setSessionGovernment(
  session: PosDiscountSession,
  government: PosGovSession,
): PosDiscountSession {
  return { ...session, government };
}

export function removeSessionVoucher(
  session: PosDiscountSession,
  code: string,
): PosDiscountSession {
  const vouchers = session.vouchers.filter((held) => held.code !== code);
  if (vouchers.length === session.vouchers.length) return session;

  return { ...session, vouchers };
}

/**
 * Records a cashier's open discount, or refuses it.
 *
 * `user` is optional only so this can be exercised without a staff fixture.
 * The register ALWAYS passes it: `validateManualDiscount` is the gate, and
 * hiding the button is not a control. Omitting the user skips the permission
 * check alone — the reason and amount rules still apply.
 */
export function setSessionManualDiscount(
  session: PosDiscountSession,
  manual: ManualDiscount,
  user?: StaffPermissionHolder,
): PosDiscountSession {
  const holder: StaffPermissionHolder =
    user ?? ({ role: "admin", isOwner: true, permissions: null } as StaffPermissionHolder);

  if (!validateManualDiscount(manual, holder).isAllowed) {
    return { ...session, manual: null };
  }

  return { ...session, manual };
}

export function clearSessionManualDiscount(
  session: PosDiscountSession,
): PosDiscountSession {
  return { ...session, manual: null };
}

/**
 * Prices the sale as it stands right now.
 *
 * Vouchers first, then the manual discount on what they left — sequential, the
 * same way vouchers stack among themselves. A manual discount computed against
 * the gross would combine with a voucher to take off more than either rule
 * allows.
 */
export function sessionDiscount(
  session: PosDiscountSession,
  cart: readonly PosCartLine[],
  serviceCharge: number,
  now: Date,
  outletId?: string | null,
  /**
   * The order's own delivery fee, so a free-delivery code has something to
   * discount. Zero — the counter-sale default — makes the engine reject one as
   * `no_delivery_fee`, which is correct at a counter and wrong on an edit.
   *
   * Deliberately NOT added to `serviceCharge`: that argument is the chargeable
   * cap, which already accounts for the fee. Counting it twice would raise the
   * cap and let a discount exceed the bill.
   */
  deliveryFee = 0,
  /** What the store's Senior/PWD rules need; absent = no government pricing. */
  govContext?: PosGovContext,
): PosSessionDiscount {
  const context = posDiscountContext(cart, serviceCharge, now, outletId, deliveryFee, session.unitPicks);
  const application = applyPosVouchers(session.vouchers, context);
  // Item discounts come off what the vouchers left, unit by unit.
  const items = priceItemDiscounts(session.itemDiscounts ?? [], context, application.remaining);
  const itemTotal = round2(items.lines.reduce((sum, line) => sum + line.amount, 0));

  const lines: OrderDiscountLine[] = [...application.discountLines, ...items.lines];

  // `cartTotals` owns this arithmetic — asking it for an undiscounted total is
  // how the sale's chargeable amount is obtained rather than re-adding the
  // subtotal and the charge here. Two implementations of the same sum are what
  // the money-wiring guardrail exists to prevent, and it caught exactly that.
  const { total: chargeable } = cartTotals([...cart], {
    type: "fixed",
    value: serviceCharge,
  });
  const remainder = round2(chargeable - application.discountTotal - itemTotal);

  if (session.manual) {
    const line = manualDiscountLine(session.manual, remainder);
    if (line) lines.push(line);
  }

  const government: PosGovState = govContext
    ? priceGovSession({
        session: session.government ?? EMPTY_GOV_SESSION,
        cart,
        context: govContext,
        serviceCharge: Math.max(0, round2(serviceCharge - deliveryFee)),
        deliveryFee,
      })
    : { status: "none" };

  const chosen = chooseRegime(lines, government);
  const total = Math.min(
    round2(chosen.lines.reduce((sum, line) => sum + line.amount, 0)),
    chargeable,
  );

  return {
    lines: chosen.lines,
    total,
    rejected: application.rejected,
    government,
    regime: chosen.regime,
  };
}

/**
 * The government discount the sale actually USES — priced, and not outranked
 * by a bigger store promo. Null otherwise.
 */
export function appliedGovernment(discount: PosSessionDiscount): PosGovPricing | null {
  if (discount.government.status !== "priced") return null;
  if (discount.regime?.regime === "other") return null;
  return discount.government.pricing;
}

/**
 * The store's own discounts or the government one — whichever saves the
 * customer more (RA 9994 §4: the higher of the two, never both).
 */
function chooseRegime(
  otherLines: readonly OrderDiscountLine[],
  government: PosGovState,
): { lines: readonly OrderDiscountLine[]; regime: RegimeChoice | null } {
  if (government.status !== "priced") return { lines: otherLines, regime: null };
  const governmentLines = government.pricing.lines;
  if (otherLines.length === 0) return { lines: governmentLines, regime: null };

  const otherTotal = round2(otherLines.reduce((sum, line) => sum + line.amount, 0));
  const regime = chooseDiscountRegime(government.pricing.result.totalReduction, otherTotal);
  return { lines: regime.regime === "government" ? governmentLines : otherLines, regime };
}
