/**
 * The Senior/PWD sales-book record a sale (or an edit) posts to the platform.
 *
 * Built at tender time, when the register still holds the cart and the
 * claimants, WITHOUT the order id — an offline sale does not have its real id
 * until the outbox writes it. `completeGovRecord` adds the ids at the moment
 * the bookkeeping runs.
 */

import type {
  GovLedgerBackend,
  GovLedgerLine,
  RecordGovDiscountRequest,
  StoredGovDiscount,
} from "../gov-discount";
import type { OrderBackend } from "../order-backend";
import type { PosCartLine } from "../pos-cart";
import { orderLineKey } from "../pos-gov-discount";

/** Everything but the ids. */
export type GovRecordDraft = Omit<RecordGovDiscountRequest, "tenantId" | "backend" | "externalOrderId">;

const LEDGER_BACKEND: Record<OrderBackend, GovLedgerBackend> = {
  platform: "platform_supabase",
  convex: "convex",
  supabase: "tenant_supabase",
};

export function ledgerBackendOf(backend: OrderBackend): GovLedgerBackend {
  return LEDGER_BACKEND[backend];
}

/** Keyed `line-<index>`, the same references the stored government block uses. */
export function ledgerLinesOf(cart: readonly PosCartLine[]): GovLedgerLine[] {
  return cart.map((line, index) => ({
    key: orderLineKey(index),
    menuItemId: line.menuItemId || null,
    name: line.name,
    quantity: line.quantity,
    amount: line.subtotal,
  }));
}

export interface GovRecordDraftInput {
  cart: readonly PosCartLine[];
  government: StoredGovDiscount | null;
  orderLabel?: string | null;
  outletId: string | null;
  revision: number;
  occurredAt: Date;
  orderTotal: number;
  serviceCharge: number;
  deliveryFee: number;
  allowShared: boolean;
  approvalId: string | null;
  approvalSkippedOffline: boolean;
}

export function govRecordDraft(input: GovRecordDraftInput): GovRecordDraft {
  return {
    orderLabel: input.orderLabel ?? null,
    outletId: input.outletId,
    revision: input.revision,
    occurredAt: input.occurredAt.toISOString(),
    orderTotal: input.orderTotal,
    source: "pos",
    lines: ledgerLinesOf(input.cart),
    serviceCharge: input.serviceCharge,
    deliveryFee: input.deliveryFee,
    allowShared: input.allowShared,
    government: input.government,
    approvalId: input.approvalId,
    approvalSkippedOffline: input.approvalSkippedOffline,
  };
}

export function completeGovRecord(
  draft: GovRecordDraft,
  ids: { tenantId: string; backend: OrderBackend; orderId: string },
): RecordGovDiscountRequest {
  return {
    ...draft,
    tenantId: ids.tenantId,
    backend: ledgerBackendOf(ids.backend),
    externalOrderId: ids.orderId,
  };
}
