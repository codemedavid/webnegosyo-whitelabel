import type { PosCartLine } from "./pos-cart";
import {
  addSessionVoucher,
  sessionDiscount,
  type PosDiscountSession,
} from "./pos-discount-session";
import type { Voucher } from "./vouchers/types";

/**
 * Answering "why did nothing happen?" before the sheet closes.
 *
 * A code can exist in the database and still be worth nothing on THIS sale:
 * fully claimed, expired, wrong branch, below its minimum, already applied, or
 * refused because a solo-only voucher is already on the bill. The engine
 * decides all of that and writes a sentence explaining it — this is what stops
 * that sentence being computed and thrown away.
 *
 * Without it the register accepted any code that merely existed, added it, and
 * then rendered no discount row: the cashier watched the sheet close with
 * nothing changed and had nothing to tell the customer.
 *
 * The verdict is reached by pricing the sale the voucher WOULD join, not by
 * inspecting the voucher alone — a solo-only code is fine by itself and
 * refused alongside another, so the answer depends on the whole session.
 */

export interface VoucherEntryVerdict {
  isAccepted: boolean;
  /** Shown to the cashier verbatim when refused. */
  message?: string;
}

export function previewSessionVoucher(
  session: PosDiscountSession,
  voucher: Voucher,
  cart: readonly PosCartLine[],
  serviceCharge: number,
  now: Date,
  outletId?: string | null,
  /** Passed through so the preview judges the same bill the pricing will. */
  deliveryFee = 0,
): VoucherEntryVerdict {
  // Adding a held code is a silent no-op, so it has to be caught here rather
  // than left to look like a voucher worth nothing.
  if (session.vouchers.some((held) => held.code === voucher.code)) {
    return { isAccepted: false, message: "That code is already applied to this sale." };
  }

  const candidate = addSessionVoucher(session, voucher);
  const priced = sessionDiscount(candidate, cart, serviceCharge, now, outletId, deliveryFee);

  const rejection = priced.rejected.find((entry) => entry.voucherId === voucher.id);
  if (rejection) {
    return { isAccepted: false, message: rejection.message };
  }

  // Accepted by every rule and still worth nothing — a free-delivery code at a
  // counter, which has no delivery to come off. A zero row reads as a broken
  // discount, so it is refused with the engine's own wording where there is
  // one and a plain fallback where there is not.
  const applied = priced.lines.some((line) => line.code === voucher.code);
  if (!applied) {
    return {
      isAccepted: false,
      message: "That code is not worth anything on this sale.",
    };
  }

  return { isAccepted: true };
}
