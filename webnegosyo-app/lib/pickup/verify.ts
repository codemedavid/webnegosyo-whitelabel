/**
 * Verifies a scanned pickup ticket against the web tracking API.
 *
 * The ticket carries the order's HMAC tracking token, but the secret that
 * signs it lives on the web server and must never ship in this bundle. So
 * verification is a round trip: /api/orders/track checks the token
 * timing-safely, resolves Convex-vs-Supabase for the tenant itself, and
 * returns the order. A forged or guessed order id comes back 401.
 *
 * `fetchImpl` is injected so the outcome mapping is testable without a
 * network.
 */

import Constants from "expo-constants";

/** The subset of the tracking payload staff need to see before confirming. */
export interface VerifiedPickupOrder {
  status: string;
  customerName?: string;
  total?: number;
  items: { name: string; quantity: number }[];
  orderType?: string;
  createdAt?: string;
}

export interface PickupTicketRef {
  tenantId: string;
  orderId: string;
  token: string;
}

export type PickupVerifyError =
  /** The API rejected the token — do NOT hand the order over. */
  | "invalid_token"
  /** No such order for this store. */
  | "not_found"
  /** Too many scans from this device; retry shortly. */
  | "rate_limited"
  /** The request never completed — no signal at the counter. */
  | "offline"
  /** The server answered, but not with an order. */
  | "unavailable"
  /** This build has no web app url configured. */
  | "not_configured";

export type PickupVerifyResult =
  | { ok: true; order: VerifiedPickupOrder }
  | { ok: false; error: PickupVerifyError };

interface VerifyOptions {
  webAppUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Same source the customer-capture call uses, so one setting covers both. */
function defaultWebAppUrl(): string {
  return Constants.expoConfig?.extra?.webAppUrl ?? "https://webnegosyo.com";
}

export async function verifyPickupTicket(
  ticket: PickupTicketRef,
  options: VerifyOptions = {}
): Promise<PickupVerifyResult> {
  const base = (options.webAppUrl ?? defaultWebAppUrl()).replace(/\/+$/, "");
  if (!base) return { ok: false, error: "not_configured" };

  const doFetch = options.fetchImpl ?? fetch;
  const url =
    `${base}/api/orders/track` +
    `?orderId=${encodeURIComponent(ticket.orderId)}` +
    `&token=${encodeURIComponent(ticket.token)}` +
    `&tenantId=${encodeURIComponent(ticket.tenantId)}`;

  let response: Response;
  try {
    response = await doFetch(url);
  } catch {
    // A failed request is NOT a failed verification. Staff must be able to
    // tell "try again" from "this code is not valid".
    return { ok: false, error: "offline" };
  }

  if (!response.ok) {
    return { ok: false, error: mapHttpError(response.status) };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "unavailable" };
  }

  const order = toVerifiedOrder(body);
  if (!order) return { ok: false, error: "unavailable" };

  return { ok: true, order };
}

function mapHttpError(status: number): PickupVerifyError {
  if (status === 401) return "invalid_token";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

/**
 * Narrow the tracking payload. A response without a status is not an order,
 * and must never be presented as one — that would put a confirm button in
 * front of staff with nothing behind it.
 */
function toVerifiedOrder(body: unknown): VerifiedPickupOrder | null {
  if (!body || typeof body !== "object") return null;

  const raw = body as Record<string, unknown>;
  if (typeof raw.status !== "string" || raw.status === "") return null;

  const items = Array.isArray(raw.items)
    ? (raw.items as Record<string, unknown>[]).map((item) => ({
        name: typeof item.name === "string" ? item.name : "Item",
        quantity: typeof item.quantity === "number" ? item.quantity : 1,
      }))
    : [];

  return {
    status: raw.status,
    customerName:
      typeof raw.customerName === "string" ? raw.customerName : undefined,
    total: typeof raw.total === "number" ? raw.total : undefined,
    orderType: typeof raw.orderType === "string" ? raw.orderType : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    items,
  };
}
