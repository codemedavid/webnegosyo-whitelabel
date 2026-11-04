/**
 * The kitchen chip on an order card.
 *
 * It used to show only while the order was `preparing`, so it vanished the
 * moment the kitchen marked the order ready — exactly when the cashier looks
 * for proof the kitchen saw it. It now stays through ready and delivered.
 * Cancelled (and anything before the kitchen) shows none.
 */

import { KITCHEN_CONFIRMED_STATUS } from "./kitchen-confirm";

const AFTER_KITCHEN_STATUSES = new Set(["ready", "delivered"]);

export function kitchenChipLabel(status: string | undefined): string | null {
  if (status === KITCHEN_CONFIRMED_STATUS) return "✓ Kitchen confirmed";
  if (status && AFTER_KITCHEN_STATUSES.has(status)) return "✓ Kitchen";
  return null;
}
