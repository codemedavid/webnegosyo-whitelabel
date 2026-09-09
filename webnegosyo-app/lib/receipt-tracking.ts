import { getWebAppUrl } from "./web-app-url";

/**
 * Fetch the customer-facing tracking URL for an order from the web server.
 *
 * The URL carries the order's HMAC tracking token; the secret that signs it
 * lives on the web server and must never ship in this bundle (same reasoning
 * as pickup/verify.ts). The endpoint authenticates the caller's own Supabase
 * session and mints only for the caller's tenant.
 *
 * Strictly best-effort: every failure — offline register, expired session,
 * old web deploy without the route — returns null, and a null URL prints a
 * receipt without a QR. Paper always wins over the QR.
 */

export interface TrackingUrlRef {
  orderId: string;
  tenantId: string;
}

export interface TrackingUrlOptions {
  webAppUrl?: string;
  fetchImpl?: typeof fetch;
  /** The caller's Supabase access token; null (demo session) mints nothing. */
  accessToken: string | null;
}

export async function fetchTrackingUrl(
  ref: TrackingUrlRef,
  options: TrackingUrlOptions,
): Promise<string | null> {
  if (!options.accessToken) return null;

  const base = (options.webAppUrl ?? getWebAppUrl()).replace(/\/+$/, "");
  if (!base) return null;

  const doFetch = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${base}/api/orders/tracking-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify({ orderId: ref.orderId, tenantId: ref.tenantId }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const url = (body as Record<string, unknown> | null)?.url;
  return typeof url === "string" && url.startsWith("http") ? url : null;
}
