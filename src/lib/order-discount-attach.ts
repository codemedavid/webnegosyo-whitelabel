/**
 * Which codes an attach actually ADDS to a placed order.
 *
 * An order arriving in orders management already carries whatever discount it
 * was placed with. When a merchant attaches another code, exactly one question
 * decides whether money and a redemption are given away twice: which of the
 * lines now on the bill are NEW?
 *
 * Two ways to get it wrong, both of which cost real money:
 *
 *   - Count a carried code again, and one voucher takes its discount off twice.
 *   - Burn a carried code again, and a second redemption is spent from the
 *     customer's own allowance for a voucher they presented once.
 *
 * Re-entering a code is an ordinary mistake rather than an exotic one: the same
 * voucher is handed over twice, or nobody recognises the label already on the
 * row.
 *
 * PORT of `newDiscountLines` in `webnegosyo-app/lib/pos-edit-mode.ts`, which the
 * register has used since discounting a placed order shipped. Pinned by
 * `tests/unit/order-discount-attach-parity.test.ts`.
 *
 * Pure: no I/O, no clock. Returns a new array and never mutates its arguments.
 */

import type { OrderDiscountLine } from './order-totals'

/**
 * The lines this attach newly added, in the order they were given.
 *
 * A manual line is deliberately excluded. It is real money off the bill with no
 * voucher behind it, so there is nothing to redeem and nothing that could be
 * redeemed twice — it must never reach a redemption call.
 *
 * Lines worth nothing, worth NaN, or worth a negative amount are excluded too.
 * The payload is read from an untyped database edge, and a negative "discount"
 * would add money to a bill.
 */
export function newDiscountLines(
  added: readonly OrderDiscountLine[],
  carried: readonly OrderDiscountLine[],
): OrderDiscountLine[] {
  const alreadyOn = new Set(
    carried.map((line) => line.code).filter((code): code is string => code != null),
  )

  return added.filter(
    (line) =>
      Number.isFinite(line.amount) &&
      line.amount > 0 &&
      line.code != null &&
      !alreadyOn.has(line.code),
  )
}
