/**
 * Telling the platform the register rang a sale.
 *
 * Status moves reach the platform's staff activity log through the customer
 * lifecycle post (lib/customers/lifecycle.ts), which every order screen sends
 * with the cashier's token. A fresh counter sale has no such post — customer
 * capture skips an anonymous walk-in — so the register reports the sale on
 * its own, through the same bounded, never-throwing transport.
 */

import { postAuthorized } from "../authorized-post";
import type { OrderBackend } from "../order-backend";

const ACTIVITY_PATH = "/api/staff/order-activity";

/** The platform's name for each backend — same table as lifecycle-plan.ts. */
const PLATFORM_BACKEND: Record<OrderBackend, string> = {
  convex: "convex",
  supabase: "tenant_supabase",
  platform: "platform_supabase",
};

export interface PosSaleFacts {
  backend: OrderBackend;
  orderId: string;
  total: number;
  outletId?: string | null;
}

export interface PosSaleActivityPayload {
  tenantId: string;
  backend: string;
  externalOrderId: string;
  status: "pending";
  source: "pos";
  orderTotal: number;
  outletId: string | null;
}

export function buildPosSalePayload(tenantId: string, facts: PosSaleFacts): PosSaleActivityPayload | null {
  if (!tenantId || !facts.orderId) return null;
  return {
    tenantId,
    backend: PLATFORM_BACKEND[facts.backend],
    externalOrderId: facts.orderId,
    status: "pending",
    source: "pos",
    orderTotal: Number.isFinite(facts.total) && facts.total >= 0 ? facts.total : 0,
    outletId: facts.outletId ?? null,
  };
}

/** Fire-and-forget; the sale is already saved by the time this runs. */
export async function notifyPosSaleActivity(tenantId: string, facts: PosSaleFacts): Promise<void> {
  const payload = buildPosSalePayload(tenantId, facts);
  if (!payload) return;
  await postAuthorized(ACTIVITY_PATH, payload);
}
