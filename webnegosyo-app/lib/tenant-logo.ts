// Tenant logo helpers for the platform console.
//
// Pure string work only — picking and uploading live in image-picker.ts and
// product-image-upload.ts, which this module deliberately does not wrap.

import { thumbUrl } from "./image-thumb";

/**
 * ImageKit folder for restaurant logos.
 *
 * Separate from the menu-item folder on purpose: the two have different
 * lifecycles, and a folder-wide cleanup of one must not touch the other.
 */
export const TENANT_LOGO_FOLDER = "tenant-logos";

const SAFE_SCHEMES = ["http:", "https:"];

/**
 * Whether a value is safe to render as an image source and store on the tenant.
 *
 * Rejects everything that is not http(s) — a `javascript:` or `data:` value
 * reaching an <Image source> (or, worse, the storefront's <img>) is an
 * injection vector, and the column is written from user-supplied input.
 */
export function isValidLogoUrl(url: string): boolean {
  if (url.trim() === "") return false;
  try {
    return SAFE_SCHEMES.includes(new URL(url).protocol);
  } catch {
    // Not parseable as a url at all.
    return false;
  }
}

/**
 * A CDN-resized logo url, or null when the tenant has no usable logo.
 *
 * Null is the signal to render the monogram fallback, so a blank or missing
 * value must not come back as an empty string — that renders as a broken image.
 *
 * @param size Target width in pixels (rendered width × screen scale).
 */
export function logoThumbUrl(
  url: string | null | undefined,
  size: number
): string | null {
  if (!url || url.trim() === "") return null;
  return thumbUrl(url, size);
}

/**
 * The tenants-table patch that sets or clears a logo.
 *
 * Clearing writes null rather than an empty string: the storefront treats ""
 * as a real url and renders a broken image.
 */
export function logoUpdatePayload(url: string | null): { logo_url: string | null } {
  if (url === null) return { logo_url: null };

  if (!isValidLogoUrl(url)) {
    throw new Error("Logo must be an http(s) url");
  }
  return { logo_url: url };
}
