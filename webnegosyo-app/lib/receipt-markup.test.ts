import { parseReceiptMarkup, parseReceiptMarkupLine } from "./receipt-markup";

describe("parseReceiptMarkupLine", () => {
  it("reads an untagged line as one plain left-aligned run", () => {
    expect(parseReceiptMarkupLine("Iced Latte  x2")).toEqual({
      align: "left",
      isTall: false,
      runs: [{ text: "Iced Latte  x2", bold: false, tall: false, wide: false }],
    });
  });

  it("centres, bolds and widens the way the Modern store name prints", () => {
    const line = parseReceiptMarkupLine("<C><W><B>SUKAD</B></W></C>");
    expect(line.align).toBe("center");
    expect(line.isTall).toBe(true);
    expect(line.runs).toEqual([{ text: "SUKAD", bold: true, tall: false, wide: true }]);
  });

  it("keeps a style on until the last nested copy closes", () => {
    const line = parseReceiptMarkupLine("<B>a<B>b</B>c</B>d");
    expect(line.runs.map((r) => [r.text, r.bold])).toEqual([
      ["a", true],
      ["b", true],
      ["c", true],
      ["d", false],
    ]);
  });

  it("right-aligns, and lets the first alignment tag win", () => {
    expect(parseReceiptMarkupLine("<R>12:30</R>").align).toBe("right");
    expect(parseReceiptMarkupLine("<C><R>x</R></C>").align).toBe("center");
  });

  it("marks a double-height line as tall", () => {
    expect(parseReceiptMarkupLine("<H>TOTAL  459.75</H>").isTall).toBe(true);
  });

  it("gives a blank line no runs", () => {
    expect(parseReceiptMarkupLine("").runs).toEqual([]);
  });
});

describe("parseReceiptMarkup", () => {
  it("splits a segment into one entry per printed line", () => {
    expect(parseReceiptMarkup("one\n<B>two</B>\n")).toHaveLength(3);
  });
});
