/**
 * Telling the platform a receipt was printed again by hand.
 *
 * Store Activity has a `receipt.reprinted` line ("Ana reprinted #12 receipt")
 * that nothing wrote. The app now reports each manual reprint AFTER the paper
 * came out, through the bounded, never-throwing transport the register's other
 * post-sale reports use. Printing never waits on it; a failure only logs.
 */

import { postAuthorized } from "../authorized-post";
import type { OrderBackend } from "../order-backend";

export const RECEIPT_REPRINTED_PATH = "/api/staff/receipt-reprinted";

/** The platform's name for each backend — same table as report-pos-sale.ts. */
const PLATFORM_BACKEND: Record<OrderBackend, string> = {
  convex: "convex",
  supabase: "tenant_supabase",
  platform: "platform_supabase",
};

export interface ReceiptReprintFacts {
  backend: OrderBackend;
  orderId: string;
  dailyNumber?: number | null;
  outletId?: string | null;
}

export interface ReceiptReprintPayload {
  tenantId: string;
  backend: string;
  orderId: string;
  dailyNumber?: number;
  outletId?: string;
}

export function buildReceiptReprintPayload(
  tenantId: string | null | undefined,
  facts: ReceiptReprintFacts,
): ReceiptReprintPayload | null {
  if (!tenantId || !facts.orderId) return null;
  const dailyNumber =
    typeof facts.dailyNumber === "number" && Number.isInteger(facts.dailyNumber) && facts.dailyNumber > 0
      ? facts.dailyNumber
      : undefined;
  return {
    tenantId,
    backend: PLATFORM_BACKEND[facts.backend],
    orderId: facts.orderId,
    ...(dailyNumber !== undefined ? { dailyNumber } : {}),
    ...(facts.outletId ? { outletId: facts.outletId } : {}),
  };
}

/** Fire-and-forget; never throws. */
export async function reportReceiptReprint(
  tenantId: string | null | undefined,
  facts: ReceiptReprintFacts,
): Promise<void> {
  const payload = buildReceiptReprintPayload(tenantId, facts);
  if (!payload) return;
  try {
    const isRecorded = await postAuthorized(RECEIPT_REPRINTED_PATH, payload);
    if (!isRecorded) console.warn("[reprint] Store Activity did not take the reprint for", facts.orderId);
  } catch (err: unknown) {
    console.warn("[reprint] Could not report the reprint:", err instanceof Error ? err.message : err);
  }
}
