/**
 * A receipt copy marked as printed again — a new object, the order untouched.
 * The receipt engine prints the mark (`ReceiptOrder.reprint`); nothing else
 * on the paper changes, least of all the order number.
 */

import type { ReceiptOrder } from "./receipt-layout";

export function markReprint<T extends ReceiptOrder>(order: T, nowMs: number): T & Required<Pick<ReceiptOrder, "reprint">> {
  return { ...order, reprint: { at: nowMs } };
}
