import { buildQrBmpBase64 } from "./receipt-qr";

/**
 * The receipt QR is printed through the thermal printer's `printImageBase64`,
 * which hands the payload to the platform image decoder (UIImage /
 * BitmapFactory). These tests decode the BMP we build byte-by-byte: a malformed
 * header doesn't throw on device — it silently prints nothing.
 */

function decodeBase64(b64: string): Uint8Array {
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    ((bytes[offset + 3]! << 24) >>> 0)
  );
}

const URL = "https://kape.example.com/kape/order/abc123?t=deadbeef";

describe("buildQrBmpBase64", () => {
  it("produces a valid 24-bit BMP the platform decoder will accept", () => {
    const result = buildQrBmpBase64(URL);
    expect(result).not.toBeNull();

    const bytes = decodeBase64(result!.base64);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("BM"); // magic
    expect(u32le(bytes, 2)).toBe(bytes.length); // declared file size matches
    expect(u32le(bytes, 10)).toBe(54); // pixel data offset (14 + 40 header)
    expect(u32le(bytes, 14)).toBe(40); // BITMAPINFOHEADER
    expect(u32le(bytes, 28) & 0xffff).toBe(24); // bits per pixel
    expect(u32le(bytes, 30)).toBe(0); // no compression
  });

  it("is square, sized (modules + 2×quiet zone) × moduleSize", () => {
    const result = buildQrBmpBase64(URL, { moduleSize: 4, quietZone: 4 });
    const bytes = decodeBase64(result!.base64);
    const width = u32le(bytes, 18);
    const height = u32le(bytes, 22);
    expect(width).toBe(height);
    expect(result!.widthPx).toBe(width);
    // Version-M QR of this URL is at least 25 modules; plus quiet zones.
    expect(width).toBeGreaterThanOrEqual((25 + 8) * 4);
    expect(width % 4).toBe(0); // every module is 4 px
  });

  it("draws a white quiet zone and a dark finder pattern", () => {
    const moduleSize = 4;
    const quietZone = 4;
    const result = buildQrBmpBase64(URL, { moduleSize, quietZone });
    const bytes = decodeBase64(result!.base64);
    const width = u32le(bytes, 18);
    const rowBytes = Math.ceil((width * 3) / 4) * 4;

    // Pixel (x, y) with y measured from the top; BMP rows are bottom-up.
    const pixel = (x: number, y: number): number => {
      const row = width - 1 - y;
      return bytes[54 + row * rowBytes + x * 3]!; // blue channel suffices (mono)
    };

    expect(pixel(0, 0)).toBe(0xff); // quiet-zone corner is white
    // Center of the first module of the top-left finder pattern is black.
    const finder = quietZone * moduleSize + Math.floor(moduleSize / 2);
    expect(pixel(finder, finder)).toBe(0x00);
  });

  it("returns null instead of throwing when the payload cannot fit", () => {
    expect(buildQrBmpBase64("x".repeat(8000))).toBeNull();
  });

  it("round-trips through base64 without corruption for a long URL", () => {
    const result = buildQrBmpBase64("https://example.com/" + "q".repeat(120));
    expect(result).not.toBeNull();
    const bytes = decodeBase64(result!.base64);
    expect(u32le(bytes, 2)).toBe(bytes.length);
  });
});
