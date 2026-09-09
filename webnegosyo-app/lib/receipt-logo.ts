import { bytesToBase64 } from "./receipt-qr";

/**
 * Download the store logo for the thermal printer. The printer's
 * `printImageBase64` decodes on-device via UIImage / BitmapFactory, both of
 * which read PNG and JPEG — so the raw downloaded bytes go straight through
 * as base64, no conversion.
 *
 * Never throws and never returns something unprintable: any failure (network,
 * HTTP error, empty body, oversized file, timeout) is null, and the caller
 * prints a logo-less receipt. Paper always comes first.
 *
 * Cached per URL for the life of the app: the logo does not change between
 * receipts, and re-downloading it used to sit between the tap and the first
 * line of paper on every single print. `prefetchLogo` warms the cache the
 * moment the tenant's logo URL is known, so the first receipt of the day is
 * as fast as the hundredth.
 */

/** A raster past this size stalls the Bluetooth link mid-receipt. */
export const MAX_LOGO_BYTES = 512 * 1024;

/**
 * A logo that has not arrived by now prints as no logo. The receipt is
 * waiting on this; a slow CDN must not hold the paper.
 */
export const LOGO_FETCH_TIMEOUT_MS = 4_000;

const logoCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

async function downloadLogoBase64(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_LOGO_BYTES) return null;
    return bytesToBase64(new Uint8Array(buffer));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface LogoFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * The logo as printable base64, from the cache when it has been fetched
 * before. A failed download is NOT cached: the next receipt tries again, so a
 * blip on the first print of the day does not strip the logo all day.
 */
export async function fetchLogoBase64(
  url: string,
  options: LogoFetchOptions = {},
): Promise<string | null> {
  const cached = logoCache.get(url);
  if (cached !== undefined) return cached;

  const pending = inflight.get(url);
  if (pending) return pending;

  const request = downloadLogoBase64(
    url,
    options.fetchImpl ?? fetch,
    options.timeoutMs ?? LOGO_FETCH_TIMEOUT_MS,
  ).then((logo) => {
    inflight.delete(url);
    if (logo !== null) logoCache.set(url, logo);
    return logo;
  });
  inflight.set(url, request);
  return request;
}

/** Warm the cache in the background. Never rejects. */
export function prefetchLogo(url: string | null | undefined, options: LogoFetchOptions = {}): void {
  if (!url) return;
  void fetchLogoBase64(url, options);
}

/** Whether a print of this logo would hit the cache (no network hop). */
export function isLogoCached(url: string): boolean {
  return logoCache.has(url);
}

/** Test seam. */
export function clearLogoCache(): void {
  logoCache.clear();
  inflight.clear();
}
