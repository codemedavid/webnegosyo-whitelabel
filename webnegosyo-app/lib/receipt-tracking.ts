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

/**
 * Minted URLs, keyed per tenant and order. A tracking URL is a signed link to
 * one order and never changes, so a reprint — the second tap on the same
 * order — has no reason to pay the mint again. Bounded FIFO: a long shift
 * does not grow it without limit.
 */
const TRACKING_URL_CACHE_CAP = 300;
const trackingUrlCache = new Map<string, string>();

function cacheKey(ref: TrackingUrlRef): string {
  return `${ref.tenantId}:${ref.orderId}`;
}

function rememberTrackingUrl(ref: TrackingUrlRef, url: string): void {
  const key = cacheKey(ref);
  trackingUrlCache.delete(key);
  trackingUrlCache.set(key, url);
  if (trackingUrlCache.size > TRACKING_URL_CACHE_CAP) {
    const oldest = trackingUrlCache.keys().next().value;
    if (oldest !== undefined) trackingUrlCache.delete(oldest);
  }
}

/** The already-minted URL for this order, if a print has fetched it before. */
export function getCachedTrackingUrl(ref: TrackingUrlRef): string | null {
  return trackingUrlCache.get(cacheKey(ref)) ?? null;
}

/** Test seam. */
export function clearTrackingUrlCache(): void {
  trackingUrlCache.clear();
}

export async function fetchTrackingUrl(
  ref: TrackingUrlRef,
  options: TrackingUrlOptions,
): Promise<string | null> {
  const cached = getCachedTrackingUrl(ref);
  if (cached) return cached;
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
  if (typeof url !== "string" || !url.startsWith("http")) return null;
  rememberTrackingUrl(ref, url);
  return url;
}
