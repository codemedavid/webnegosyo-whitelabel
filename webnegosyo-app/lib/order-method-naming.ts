/**
 * When the order screen offers "Paid, method not picked — tap how".
 *
 * A paid sale with no method and nothing on the ledger is what Sales files
 * under "Paid, method not picked" (Koko Coffee, 2026-11-24). Naming its method
 * is a label fix, not a payment, so it is offered only where that is all it
 * is: the platform backend (the write is `orders:setPaymentMethod`), a ledger
 * read that came back EMPTY (rows there would carry their own methods), and a
 * person who may take payments. Pure — Jest cannot import `app/`.
 */

import type { LedgerState } from "./order-ledger";
import type { OrderBackend } from "./order-backend";
import { hasPermission, type StaffPermissionHolder } from "./staff-permissions";

export interface MethodNamingInput {
  backend: OrderBackend | null | undefined;
  status: string;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  ledger: LedgerState;
  /** Ledger rows read for the order; undefined while loading. */
  ledgerRows: number | undefined;
  user: StaffPermissionHolder;
  isDemo: boolean;
  isOffline: boolean;
}

export function canNameOrderMethod(input: MethodNamingInput): boolean {
  if (input.backend !== "platform" || input.isDemo || input.isOffline) return false;
  if (input.status === "cancelled") return false;
  if (input.paymentStatus !== "paid" && input.paymentStatus !== "verified") return false;
  if (input.paymentMethod?.trim()) return false;
  if (input.ledger !== "available" || input.ledgerRows !== 0) return false;
  return hasPermission(input.user, "pos");
}
