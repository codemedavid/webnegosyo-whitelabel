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

import { receiptMarkupToEscPos, charsForPaperWidth, printerWidthType } from "./receipt-escpos";

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
