import qrcode from "qrcode-generator";

/**
 * Build the QR code printed at the bottom of a receipt as a base64 BMP for the
 * thermal printer's `printImageBase64` (decoded on-device by UIImage /
 * BitmapFactory, both of which accept uncompressed 24-bit BMP).
 *
 * Everything here is pure JS on purpose: no native module, no canvas, no view
 * capture — so the whole path ships over-the-air and is unit-testable byte by
 * byte. Returns null instead of throwing: a QR that cannot be built must never
 * stop the receipt itself from printing.
 */

export interface QrBmpOptions {
  /** Printed pixels per QR module. */
  moduleSize?: number;
  /** White border, in modules, on every side. The QR spec asks for 4. */
  quietZone?: number;
}

export interface QrBmpResult {
  base64: string;
  /** Square edge length in pixels — callers pass it to printImageBase64. */
  widthPx: number;
}

/**
 * 4 dots (0.5mm) per module: a 41-module tracking code lands at ~25mm and a
 * 49-module one at ~29mm. 6 filled the whole 58mm head — 15 KB of raster
 * trickling over Bluetooth, a QR too big for the slip, and modules that only
 * scanned when every packet arrived in time.
 */
const DEFAULT_MODULE_SIZE = 4;
const DEFAULT_QUIET_ZONE = 4;
/**
 * Narrowest print head we support, in dots (58mm paper; 80mm is 576). A raster
 * wider than the head is truncated by the printer rather than scaled, and a
 * clipped QR does not scan — so the module size gives way instead.
 */
const MAX_PRINT_WIDTH_PX = 384;
/** Error correction M: survives thermal smudging without bloating the code. */
const ERROR_CORRECTION = "M";

const BMP_HEADER_BYTES = 54; // 14-byte file header + 40-byte BITMAPINFOHEADER
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function writeU32le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function writeU16le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

/**
 * Hermes ships no Buffer/btoa; encoding ~10 KB ourselves is the cheap fix.
 * Exported for lib/receipt-logo.ts, which encodes downloaded logo bytes the
 * same way.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64_ALPHABET[(triple >>> 18) & 0x3f]!;
    out += BASE64_ALPHABET[(triple >>> 12) & 0x3f]!;
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >>> 6) & 0x3f]! : "=";
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 0x3f]! : "=";
  }
  return out;
}

export function buildQrBmpBase64(
  text: string,
  options: QrBmpOptions = {},
): QrBmpResult | null {
  const moduleSize = options.moduleSize ?? DEFAULT_MODULE_SIZE;
  const quietZone = options.quietZone ?? DEFAULT_QUIET_ZONE;

  let moduleCount: number;
  let isDark: (row: number, col: number) => boolean;
  try {
    const qr = qrcode(0, ERROR_CORRECTION); // type 0 = smallest fitting version
    qr.addData(text);
    qr.make();
    moduleCount = qr.getModuleCount();
    isDark = (row, col) => qr.isDark(row, col);
  } catch {
    // Payload too long for any QR version (or unencodable) — skip the QR.
    return null;
  }

  // Shrink the module size until the square fits the head. A long payload
  // needs a higher QR version (more modules), which at the default 6 dots per
  // module rasterizes well past the paper.
  const spanModules = moduleCount + quietZone * 2;
  const fittedModuleSize = Math.max(
    1,
    Math.min(moduleSize, Math.floor(MAX_PRINT_WIDTH_PX / spanModules)),
  );
  const widthPx = spanModules * fittedModuleSize;
  const rowBytes = Math.ceil((widthPx * 3) / 4) * 4; // rows pad to 4 bytes
  const fileSize = BMP_HEADER_BYTES + rowBytes * widthPx;
  const bytes = new Uint8Array(fileSize).fill(0xff); // white by default

  // BITMAPFILEHEADER
  bytes[0] = 0x42; // 'B'
  bytes[1] = 0x4d; // 'M'
  writeU32le(bytes, 2, fileSize);
  writeU32le(bytes, 6, 0); // reserved
  writeU32le(bytes, 10, BMP_HEADER_BYTES);

  // BITMAPINFOHEADER
  writeU32le(bytes, 14, 40);
  writeU32le(bytes, 18, widthPx);
  writeU32le(bytes, 22, widthPx); // positive height = bottom-up rows
  writeU16le(bytes, 26, 1); // planes
  writeU16le(bytes, 28, 24); // bits per pixel
  writeU32le(bytes, 30, 0); // BI_RGB, uncompressed
  writeU32le(bytes, 34, rowBytes * widthPx);
  writeU32le(bytes, 38, 2835); // 72 DPI in pixels/metre
  writeU32le(bytes, 42, 2835);
  writeU32le(bytes, 46, 0);
  writeU32le(bytes, 50, 0);

  // Paint the dark modules. y runs top-down; BMP rows are stored bottom-up.
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!isDark(row, col)) continue;
      const x0 = (quietZone + col) * fittedModuleSize;
      const y0 = (quietZone + row) * fittedModuleSize;
      for (let dy = 0; dy < fittedModuleSize; dy++) {
        const bmpRow = widthPx - 1 - (y0 + dy);
        const rowOffset = BMP_HEADER_BYTES + bmpRow * rowBytes;
        for (let dx = 0; dx < fittedModuleSize; dx++) {
          const px = rowOffset + (x0 + dx) * 3;
          bytes[px] = 0x00;
          bytes[px + 1] = 0x00;
          bytes[px + 2] = 0x00;
        }
      }
    }
  }

  return { base64: bytesToBase64(bytes), widthPx };
}
