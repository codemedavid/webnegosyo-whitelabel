import { bytesToBase64 } from "./receipt-qr";

/**
 * Download the store logo for the thermal printer. The printer's
 * `printImageBase64` decodes on-device via UIImage / BitmapFactory, both of
 * which read PNG and JPEG — so the raw downloaded bytes go straight through
 * as base64, no conversion.
 *
 * Never throws and never returns something unprintable: any failure (network,
 * HTTP error, empty body, oversized file) is null, and the caller prints a
 * logo-less receipt. Paper always comes first.
 */

/** A raster past this size stalls the Bluetooth link mid-receipt. */
export const MAX_LOGO_BYTES = 512 * 1024;

export async function fetchLogoBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_LOGO_BYTES) return null;
    return bytesToBase64(new Uint8Array(buffer));
  } catch {
    return null;
  }
}
