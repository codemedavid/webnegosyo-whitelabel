/**
 * Telling the platform that a sale happened, so its guest gets a profile.
 *
 * Customer capture is wired into the web app's order actions, and the merchant
 * app reaches none of them: it writes orders straight to Convex, or to the
 * platform Supabase through `lib/backends/`. So a counter sale built no customer
 * profile at all — the cashier could type the guest's number in perfectly and
 * the Regulars list would never hear about it. Every POS sale was invisible to
 * the customer system.
 *
 * This is the register's way into that path, and it borrows its contract wholesale
 * from `lib/pos-stock-notify.ts`: by the time it runs the sale is rung up,
 * tendered and saved, so **nothing here throws**. A guest missing from the
 * Regulars list is recoverable by backfill; a register that will not close a
 * sale because a bookkeeping call failed is not.
 */

import Constants from "expo-constants";
import { supabase } from "../supabase";
import { resolveCustomerIdentity } from "../customer-identity";
import type { OrderBackend } from "../order-backend";

function getWebAppUrl(): string {
  return Constants.expoConfig?.extra?.webAppUrl ?? "https://webnegosyo.com";
}

/** One line of the sale, as the customer profile aggregate consumes it. */
export interface CaptureItem {
  name: string;
  quantity: number;
}

/** What the register knows about a sale it has just written. */
export interface CaptureOrderFacts {
  backend: OrderBackend;
  /** The order's id in whichever backend wrote it. */
  orderId: string;
  name?: string | null;
  contact?: string | null;
  customerData?: unknown;
  total: number;
  /** ISO string. Omitted lets the server stamp its own — see the route. */
  createdAt?: string;
  channel?: string | null;
  items?: readonly CaptureItem[];
}

/**
 * The platform's name for each backend.
 *
 * The two vocabularies differ on one entry and it matters: the app's `supabase`
 * means *the tenant's own project*, which the platform calls `tenant_supabase`.
 * Sending the app's word would be refused as an unknown backend, and the sale
 * would be dropped rather than captured.
 */
const PLATFORM_BACKEND: Record<OrderBackend, string> = {
  convex: "convex",
  platform: "platform",
  supabase: "tenant_supabase",
};

export interface CapturePayload {
  tenantId: string;
  backend: string;
  orderId: string;
  name: string | null;
  contact: string | null;
  customerData: unknown;
  total: number;
  createdAt?: string;
  channel: string | null;
  items: CaptureItem[];
}

/**
 * The request body for a sale, or null when there is nothing worth sending.
 *
 * Resolving identity here rather than server-side only is deliberate: an
 * anonymous walk-in will never become a customer, and skipping the round trip
 * keeps the busiest screen in the app off the network for the most common sale
 * there is. The server resolves identity again regardless — this is an
 * optimization, not the check.
 */
export function buildCapturePayload(
  tenantId: string,
  facts: CaptureOrderFacts,
): CapturePayload | null {
  if (!tenantId) return null;

  const identity = resolveCustomerIdentity({
    name: facts.name,
    contact: facts.contact,
    customerData: facts.customerData,
  });
  if (!identity.identityKey) return null;

  return {
    tenantId,
    backend: PLATFORM_BACKEND[facts.backend],
    orderId: facts.orderId,
    name: facts.name ?? null,
    contact: facts.contact ?? null,
    customerData: facts.customerData ?? null,
    total: facts.total,
    createdAt: facts.createdAt,
    channel: facts.channel ?? null,
    items: facts.items ? [...facts.items] : [],
  };
}

/** Fire-and-forget: roll a just-written sale into its guest's profile. */
export async function notifyCustomerCapture(
  tenantId: string,
  facts: CaptureOrderFacts,
): Promise<void> {
  const payload = buildCapturePayload(tenantId, facts);
  if (!payload) return;

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    await fetch(`${getWebAppUrl()}/api/customers/capture-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort — the sale already succeeded. A profile that misses one order
    // is fixable; a tender screen that fails after the customer has paid is not.
  }
}
