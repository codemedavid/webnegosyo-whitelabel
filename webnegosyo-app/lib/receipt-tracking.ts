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
  /** How long the mint may take before the receipt prints without a QR. */
  timeoutMs?: number;
}

/**
 * Longer than a healthy round-trip, shorter than a cashier's patience: this
 * runs between "Confirm" and the first line of paper, and it used to have no
 * deadline at all.
 */
export const TRACKING_URL_TIMEOUT_MS = 6_000;

export async function fetchTrackingUrl(
  ref: TrackingUrlRef,
  options: TrackingUrlOptions,
): Promise<string | null> {
  if (!options.accessToken) return null;

  const base = (options.webAppUrl ?? getWebAppUrl()).replace(/\/+$/, "");
  if (!base) return null;

  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Aborted AND raced (see authorized-post.ts): the abort frees the socket,
  // the race is what guarantees the receipt prints anyway.
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, options.timeoutMs ?? TRACKING_URL_TIMEOUT_MS);
  });

  let body: unknown;
  try {
    const response = await Promise.race([
      doFetch(`${base}/api/orders/tracking-url`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.accessToken}`,
        },
        body: JSON.stringify({ orderId: ref.orderId, tenantId: ref.tenantId }),
      }),
      expiry,
    ]);
    if (!response.ok) return null;
    body = await Promise.race([response.json(), expiry]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const url = (body as Record<string, unknown> | null)?.url;
  return typeof url === "string" && url.startsWith("http") ? url : null;
}
