/**
 * The last step before the printer: receipt markup becomes ESC/POS bytes.
 *
 * The layout engine emits `<C>`, `<R>`, `<B>`, `<H>` and `<W>` tags so that
 * previews and the printer read one text. The Android driver's own tag parser
 * has no bold tag and DROPS any `<` it does not recognise; the iOS driver
 * strips tags outright and centres every call by default. Converting here,
 * to raw control bytes both drivers pass through untouched, is what makes a
 * styled line print the same on both.
 */

import { receiptMarkupToEscPos, charsForPaperWidth, printerWidthType, escPosQrCode, QR_NATIVE_MAX_BYTES, QR_NATIVE_MODULE_SIZE } from "./receipt-escpos";

const ESC = "\x1B";

describe("receiptMarkupToEscPos", () => {
  it("starts every print left-aligned, since the iOS driver centres by default", () => {
    expect(receiptMarkupToEscPos("plain")).toBe(`${ESC}a\x00plain`);
  });

  it("centres a <C> line and returns to the left margin after it", () => {
    expect(receiptMarkupToEscPos("<C>Kape Co</C>")).toBe(
      `${ESC}a\x00${ESC}a\x01Kape Co${ESC}a\x00`,
    );
  });

  it("right-aligns a <R> line", () => {
    expect(receiptMarkupToEscPos("<R>P10.00</R>")).toBe(
      `${ESC}a\x00${ESC}a\x02P10.00${ESC}a\x00`,
    );
  });

  it("turns bold on with ESC E and off again, and mirrors it in the ESC ! font byte", () => {
    expect(receiptMarkupToEscPos("<B>TOTAL</B>")).toBe(
      `${ESC}a\x00${ESC}!\x08${ESC}E\x01TOTAL${ESC}!\x00${ESC}E\x00`,
    );
  });

  it("makes a <H> line double height and a <W> line double width and height", () => {
    expect(receiptMarkupToEscPos("<H>x</H>")).toBe(`${ESC}a\x00${ESC}!\x10x${ESC}!\x00`);
    expect(receiptMarkupToEscPos("<W>x</W>")).toBe(`${ESC}a\x00${ESC}!\x30x${ESC}!\x00`);
  });

  it("composes nested tags into one font byte and unwinds them in order", () => {
    // Centre + double size + bold: the store name line.
    expect(receiptMarkupToEscPos("<C><W><B>KAPE</B></W></C>")).toBe(
      `${ESC}a\x00${ESC}a\x01${ESC}!\x30${ESC}!\x38${ESC}E\x01KAPE${ESC}!\x30${ESC}E\x00${ESC}!\x00${ESC}a\x00`,
    );
  });

  it("leaves text without markup otherwise untouched, including angle brackets it does not own", () => {
    expect(receiptMarkupToEscPos("1 <chili> sauce")).toBe(`${ESC}a\x001 <chili> sauce`);
  });
});

describe("paper width helpers", () => {
  it("maps 58mm to 32 columns and 80mm to 48", () => {
    expect(charsForPaperWidth(58)).toBe(32);
    expect(charsForPaperWidth(80)).toBe(48);
  });

  it("names the width the way the iOS driver expects", () => {
    expect(printerWidthType(58)).toBe("58");
    expect(printerWidthType(80)).toBe("80");
  });
});

describe("escPosQrCode — the printer draws the tracking code", () => {
  const url = "https://www.webnegosyo.com/seacook/order/jh77d616dta0dzva90pfwm5ypd8dxt7h?t=1266c59676e67244a3a8";

  it("emits an ASCII-clean GS ( k sequence: model, size, correction, store, print", () => {
    const bytes = escPosQrCode(url)!;
    expect(bytes).not.toBeNull();
    for (let i = 0; i < bytes.length; i++) expect(bytes.charCodeAt(i)).toBeLessThan(0x80);
    expect(bytes.startsWith("\x1Ba\x01")).toBe(true); // centred
    expect(bytes).toContain("\x1D(k\x04\x001A\x32\x00");
    expect(bytes).toContain(`\x1D(k\x03\x001C${String.fromCharCode(QR_NATIVE_MODULE_SIZE)}`);
    expect(bytes).toContain("\x1D(k\x03\x001E\x31");
    expect(bytes).toContain(`\x1D(k${String.fromCharCode(url.length + 3)}\x001P0${url}`);
    expect(bytes.endsWith("\x1D(k\x03\x001Q0\n\x1Ba\x00")).toBe(true);
  });

  it("refuses a payload the one-byte length cannot carry cleanly, so the raster takes over", () => {
    expect(escPosQrCode("x".repeat(QR_NATIVE_MAX_BYTES))).not.toBeNull();
    expect(escPosQrCode("x".repeat(QR_NATIVE_MAX_BYTES + 1))).toBeNull();
    expect(escPosQrCode("https://x.ph/₱")).toBeNull();
    expect(escPosQrCode("")).toBeNull();
  });
});
