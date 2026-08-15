import { useAuthStore } from "../stores/auth-store";
import {
  notifyLoyverseOrderConfirmed,
  type LoyverseOrderLine,
} from "./loyverse-notify";

/**
 * "This order was just confirmed — tell Loyverse", for every surface that can
 * confirm one: the order detail screen, the orders list, and the register
 * drawer. Confirming from a list used to push nothing at all, because a list
 * row carries a total and an item COUNT, never the dishes.
 *
 * Items are optional for exactly that reason. A screen that already holds the
 * lines passes them and saves the server a read; one that does not passes only
 * the id, and the server reads them back out of the tenant's order backend.
 *
 * Everything policy-shaped stays on the server — whether the tenant has
 * Loyverse at all, whether its push mode fires on confirm, whether this order
 * was already pushed — so screens call this unconditionally.
 */
/**
 * The reference Loyverse files the receipt under. Derived from the order id in
 * one place so a drawer confirm and a detail confirm can never file the same
 * sale under two different references.
 */
function receiptReference(orderId: string): string {
  return orderId.slice(-6).toUpperCase();
}

export async function pushConfirmedOrderToLoyverse(
  orderId: string,
  items?: readonly LoyverseOrderLine[],
): Promise<void> {
  const tenantId = useAuthStore.getState().tenantId;
  if (!tenantId) return;

  try {
    await notifyLoyverseOrderConfirmed(tenantId, {
      orderId,
      orderNumber: receiptReference(orderId),
      ...(items ? { items } : {}),
    });
  } catch {
    // Never throws by contract: the order is already confirmed when this runs,
    // and a missing receipt is reconcilable in Back Office. A confirm that
    // fails because of it is not.
  }
}
