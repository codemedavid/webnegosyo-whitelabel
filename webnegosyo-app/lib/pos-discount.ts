/**
 * Discounting at the register.
 *
 * Two different things live here, and the difference matters.
 *
 * A VOUCHER is a rule the merchant wrote in advance. The cashier types a code
 * and the engine — the same engine the storefront and the server use, kept
 * byte-identical by `tests/unit/vouchers/engine-parity.test.ts` — decides what
 * it is worth. The cashier has no say.
 *
 * A MANUAL discount is the cashier deciding, at the counter, to take money off:
 * a damaged item, a regular, a staff meal. There is no rule to evaluate, which
 * makes it a till-skimming vector. So it is gated on the `vouchers` permission
 * and refuses to exist without a written reason.
 *
 * That audit trail is load-bearing. The register prices locally — it has to
 * work on a flaky connection at a counter — so the defence against a forced
 * discount cannot be arithmetic. It is knowing who did it and why. Redemptions
 * are still burned server-side, where the conditional UPDATE inside
 * `redeem_voucher()` is the real protection against over-redemption.
 */

import { round2 } from "./pos-cart";
import type { OrderDiscountLine } from "./order-totals";
import { hasPermission, type StaffPermissionHolder } from "./staff-permissions";
import { applyVouchers, type VoucherApplication } from "./vouchers/stacking";
import {
  applyDiscountToRemaining,
  computeVoucherDiscount,
  type RemainingAmounts,
} from "./vouchers/discount";
import type { DiscountContext, UnitPicks, Voucher } from "./vouchers/types";
import type { PosCartLine } from "./pos-cart";

/** A cashier-entered discount. Not a voucher; burns no redemption. */
export interface ManualDiscount {
  kind: "percent" | "fixed";
  /** Percent (0–100) for `percent`, pesos for `fixed`. */
  value: number;
  /** Required. Printed on the receipt and kept for the audit trail. */
  reason: string;
}

export interface ManualDiscountVerdict {
  isAllowed: boolean;
  /** Shown to the cashier verbatim when refused. */
  message?: string;
}

const MAX_PERCENT = 100;

/**
 * Describes the register's cart in the engine's vocabulary.
 *
 * `deliveryFee` defaults to zero because a counter sale has no delivery, so a
 * free-delivery voucher correctly finds nothing to discount rather than being
 * special-cased away. It is a PARAMETER rather than a constant because the same
 * builder also describes an EDITED order, which may well be a delivery with a
 * real fee — see `pos-edit-discount.ts`. Hardcoding the zero there rejected
 * every free-delivery voucher as `no_delivery_fee` and re-billed the customer
 * the delivery they had been given free.
 */
export function posDiscountContext(
  cart: readonly PosCartLine[],
  serviceCharge: number,
  now: Date,
  outletId?: string | null,
  deliveryFee = 0,
  /** Which units each unit-limited voucher should land on (code → cart key → units). */
  unitPicks?: Readonly<Record<string, UnitPicks>>,
): DiscountContext {
  return {
    ...(unitPicks && Object.keys(unitPicks).length > 0 ? { unitPicks } : {}),
    lines: cart.map((line) => ({
      id: line.key,
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      subtotal: line.subtotal,
    })),
    deliveryFee,
    serviceCharge,
    channel: "pos",
    now,
    outletId: outletId ?? null,
  };
}

/**
 * Evaluates presented vouchers against the counter sale.
 *
 * A thin pass-through today, and deliberately so: every rule — expiry, branch,
 * channel, stacking order, minimum spend — belongs to the shared engine, and a
 * register-specific exception is exactly how the two surfaces would start
 * disagreeing about what a code is worth.
 */
export function applyPosVouchers(
  vouchers: readonly Voucher[],
  context: DiscountContext,
): VoucherApplication {
  return applyVouchers(vouchers, context);
}

/**
 * May this person take this much off, and have they said why?
 *
 * Checked before the amount is computed, so a refusal never depends on the size
 * of the sale — a cashier must not learn that the same discount is allowed on a
 * bigger bill.
 */
export function validateManualDiscount(
  discount: ManualDiscount,
  user: StaffPermissionHolder,
): ManualDiscountVerdict {
  if (!hasPermission(user, "vouchers")) {
    return {
      isAllowed: false,
      message: "You do not have permission to discount an order.",
    };
  }

  if (discount.reason.trim() === "") {
    return { isAllowed: false, message: "Give a reason for this discount." };
  }

  if (!Number.isFinite(discount.value) || discount.value <= 0) {
    return { isAllowed: false, message: "Enter a discount greater than zero." };
  }

  // Refused rather than clamped: a cashier meaning 10.00 and typing 1000 should
  // be stopped, not silently obeyed with a free sale.
  if (discount.kind === "percent" && discount.value > MAX_PERCENT) {
    return { isAllowed: false, message: "A discount cannot exceed 100%." };
  }

  return { isAllowed: true };
}

/**
 * The discount line a manual discount becomes, or null if it is not valid.
 *
 * Null rather than a zero-peso line: a "₱0.00 off" line printed on a receipt is
 * worse than no line at all.
 *
 * Carries no `voucherId` or `code` — nothing is redeemed, so nothing is burned.
 * `chargeable` is the sale before any discount, which is what a percentage is a
 * percentage OF.
 */
export function manualDiscountLine(
  discount: ManualDiscount,
  chargeable: number,
): OrderDiscountLine | null {
  if (!Number.isFinite(discount.value) || discount.value <= 0) return null;
  if (discount.kind === "percent" && discount.value > MAX_PERCENT) return null;
  if (!Number.isFinite(chargeable) || chargeable <= 0) return null;

  const requested =
    discount.kind === "percent"
      ? round2((chargeable * discount.value) / 100)
      : round2(discount.value);

  const amount = Math.min(requested, round2(chargeable));
  if (amount <= 0) return null;

  return { label: `Discount — ${discount.reason.trim()}`, amount };
}

/**
 * A cashier's discount on ONE dish of the sale — "1 of the 5 fries came out
 * cold". Same gate and audit trail as the whole-order discount (the `vouchers`
 * permission and a written reason); a percent or a peso amount off EACH of
 * `units` units of that line. At most one per line: a second replaces it.
 */
export interface ManualItemDiscount {
  /** The register cart line (`PosCartLine.key`). */
  lineKey: string;
  /** How many of the line's units get it; trimmed to what the line still has. */
  units: number;
  kind: "percent" | "fixed";
  /** Percent (0–100) for `percent`, pesos off each unit for `fixed`. */
  value: number;
  reason: string;
}

export function validateManualItemDiscount(
  discount: ManualItemDiscount,
  user: StaffPermissionHolder,
): ManualDiscountVerdict {
  const base = validateManualDiscount(
    { kind: discount.kind, value: discount.value, reason: discount.reason },
    user,
  );
  if (!base.isAllowed) return base;
  if (!Number.isInteger(discount.units) || discount.units < 1) {
    return { isAllowed: false, message: "Choose at least one item." };
  }
  return { isAllowed: true };
}

/** "Discount — Damaged": the same label as a whole-order discount, so reports group them. */
function manualLabel(reason: string): string {
  return `Discount — ${reason.trim()}`;
}

/**
 * Prices the cashier's item discounts on what the vouchers left, one unit at a
 * time, through the voucher engine's own unit arithmetic — so an item
 * discount and a voucher can never both take the same fries past its price.
 * Returns the discount lines (each naming its dish) and what is left after.
 */
export function priceItemDiscounts(
  discounts: readonly ManualItemDiscount[],
  context: DiscountContext,
  remaining: RemainingAmounts,
): { lines: OrderDiscountLine[]; remaining: RemainingAmounts } {
  let left = remaining;
  const lines: OrderDiscountLine[] = [];
  for (const discount of discounts) {
    const line = context.lines.find((candidate) => candidate.id === discount.lineKey);
    if (!line) continue;
    const available = (left.byUnit[line.id] ?? []).filter((cents) => cents > 0).length;
    const units = Math.min(Math.floor(discount.units), available);
    if (units < 1) continue;

    const code = `ITEM:${line.id}`;
    const voucher: Voucher = {
      id: code,
      code,
      name: manualLabel(discount.reason),
      discountType: discount.kind,
      discountValue: discount.value,
      scope: "universal",
      isStackable: true,
      usedCount: 0,
      channels: ["pos"],
      isActive: true,
      maxDiscountedUnits: units,
    };
    const result = computeVoucherDiscount(
      voucher,
      { ...context, lines: [line], unitPicks: { [code]: { [line.id]: units } } },
      left,
    );
    if (result.amount <= 0) continue;
    left = applyDiscountToRemaining(left, result);
    lines.push({
      label: manualLabel(discount.reason),
      amount: result.amount,
      items: result.allocations.map((allocation) => ({
        lineKey: allocation.lineId,
        units: allocation.units ?? units,
        amount: allocation.amount,
      })),
    });
  }
  return { lines, remaining: left };
}
