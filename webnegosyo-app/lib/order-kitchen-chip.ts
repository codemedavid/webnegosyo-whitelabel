/**
 * The kitchen chip on an order card.
 *
 * It used to show only while the order was `preparing`, so it vanished the
 * moment the kitchen marked the order ready — exactly when the cashier looks
 * for proof the kitchen saw it. It now stays through ready ("✓ Kitchen").
 * A delivered order shows none: a counter sale handed over at once is
 * delivered without ever passing the kitchen, so the chip would claim a step
 * that never happened. Cancelled (and anything before the kitchen) shows none.
 */

import { KITCHEN_CONFIRMED_STATUS } from "./kitchen-confirm";

const KITCHEN_DONE_STATUS = "ready";

export function kitchenChipLabel(status: string | undefined): string | null {
  if (status === KITCHEN_CONFIRMED_STATUS) return "✓ Kitchen confirmed";
  if (status === KITCHEN_DONE_STATUS) return "✓ Kitchen";
  return null;
}
