import { cartTotals, round2, type PosCartLine } from "./pos-cart";
import type { OrderDiscountLine } from "./order-totals";
import type { StaffPermissionHolder } from "./staff-permissions";
import {
  applyPosVouchers,
  manualDiscountLine,
  posDiscountContext,
  validateManualDiscount,
  type ManualDiscount,
} from "./pos-discount";
import type { RejectedVoucher } from "./vouchers/stacking";
import type { Voucher } from "./vouchers/types";

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
}

export interface PosSessionDiscount {
  lines: readonly OrderDiscountLine[];
  total: number;
  /** Why a presented voucher was refused, so the cashier can say. */
  rejected: readonly RejectedVoucher[];
}

export const EMPTY_POS_DISCOUNT_SESSION: PosDiscountSession = {
  vouchers: [],
  manual: null,
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
): PosSessionDiscount {
  const context = posDiscountContext(cart, serviceCharge, now, outletId);
  const application = applyPosVouchers(session.vouchers, context);

  const lines: OrderDiscountLine[] = [...application.discountLines];

  // `cartTotals` owns this arithmetic — asking it for an undiscounted total is
  // how the sale's chargeable amount is obtained rather than re-adding the
  // subtotal and the charge here. Two implementations of the same sum are what
  // the money-wiring guardrail exists to prevent, and it caught exactly that.
  const { total: chargeable } = cartTotals([...cart], {
    type: "fixed",
    value: serviceCharge,
  });
  const remainder = round2(chargeable - application.discountTotal);

  if (session.manual) {
    const line = manualDiscountLine(session.manual, remainder);
    if (line) lines.push(line);
  }

  const total = Math.min(
    round2(lines.reduce((sum, line) => sum + line.amount, 0)),
    chargeable,
  );

  return { lines, total, rejected: application.rejected };
}
