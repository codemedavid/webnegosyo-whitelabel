/**
 * The ITEM SUMMARY slip: what sold in the picked days, one dish per line, so
 * an owner can check a day's take against the kitchen. Pinned like the other
 * cash slips: every line fits its roll, every byte is printable ASCII, the
 * total is the summary's net sales (never a sum made up on the phone), and the
 * slip says it is not an official receipt.
 */
import type { ItemSummary } from "../reports/item-summary";
import type { PrintSegment } from "../printer";
import { ITEM_SUMMARY_TITLE, buildItemSummarySlip, itemSummaryLines } from "./item-summary-slip";
import { slipPlainText, visibleLength } from "./slip-text";

const WIDTHS = [32, 48] as const;
const PRINTED_AT = new Date("2026-11-04T13:30:00.000Z"); // Wed Nov 4, 9:30 PM Manila

const SUMMARY: ItemSummary = {
  orders: 42,
  netCents: 1250000,
  itemsNetCents: 1250000,
  quantity: 71,
  ordersWithoutLines: 1,
  ordersLinesMismatch: 0,
  rows: [
    { key: "id:a", label: "Sizzling Pork Sisig with Garlic Rice and Egg", quantity: 20, orders: 18, netCents: 700000, isUnrecorded: false },
    { key: "id:b", label: "Iced Spanish Latte (16oz)", quantity: 51, orders: 30, netCents: 535000, isUnrecorded: false },
    { key: "unrecorded", label: "Items not recorded", quantity: 0, orders: 1, netCents: 15000, isUnrecorded: true },
  ],
};

function text(segments: PrintSegment[]): string {
  const [segment] = segments;
  if (segment?.type !== "text") throw new Error("expected one text segment");
  return segment.text;
}

const RANGE = { fromKey: "2026-10-29", toKey: "2026-11-04" };
const OPTIONS = { storeName: "Loly's Café", branchName: "Main branch", printedAt: PRINTED_AT, ...RANGE };

describe.each(WIDTHS)("item summary slip at %i columns", (width) => {
  const lines = itemSummaryLines(SUMMARY, { ...OPTIONS, width });

  it("fits every line on the roll", () => {
    lines.forEach((line) => expect(visibleLength(line)).toBeLessThanOrEqual(width));
  });

  it("prints ASCII only", () => {
    expect(text(buildItemSummarySlip(SUMMARY, { ...OPTIONS, width }))).toMatch(/^[\x20-\x7E\n]*$/);
  });

  it("is one text segment for the print path", () => {
    expect(buildItemSummarySlip(SUMMARY, { ...OPTIONS, width })).toHaveLength(1);
  });

  it("names the store, branch, title and the days", () => {
    const plain = slipPlainText(buildItemSummarySlip(SUMMARY, { ...OPTIONS, width }));
    expect(plain).toContain("LOLY'S CAFE");
    expect(plain).toContain("Main branch");
    expect(plain).toContain(ITEM_SUMMARY_TITLE);
    expect(plain).toContain("Thu, Oct 29, 2026");
    expect(plain).toContain("Wed, Nov 4, 2026");
    expect(plain).toContain("Printed Nov 4, 2026 9:30 PM");
    expect(plain).toContain("Not an official receipt.");
  });

  it("right-aligns quantity and amount, wrapping long names", () => {
    const plain = slipPlainText(buildItemSummarySlip(SUMMARY, { ...OPTIONS, width }));
    const amountLine = plain.split("\n").find((line) => line.endsWith("7,000.00"));
    expect(amountLine).toBeDefined();
    expect(amountLine).toMatch(/ 20 +7,000\.00$/);
    expect(amountLine?.length).toBe(width);
    expect(plain).toContain("Sizzling");
  });

  it("totals with the summary's net sales", () => {
    const plain = slipPlainText(buildItemSummarySlip(SUMMARY, { ...OPTIONS, width }));
    expect(plain).toMatch(/NET SALES +71 +12,500\.00/);
    expect(plain).toMatch(/Orders +42/);
  });

  it("shows no quantity for the orders saved without dishes", () => {
    const plain = slipPlainText(buildItemSummarySlip(SUMMARY, { ...OPTIONS, width }));
    // 32 columns put the figures on their own line under a long label.
    expect(plain).toMatch(/Items not recorded( +|\n +)- +150\.00/);
  });

  it("matches the printed layout", () => {
    expect(slipPlainText(buildItemSummarySlip(SUMMARY, { ...OPTIONS, width }))).toMatchSnapshot();
  });
});

describe("item summary slip edges", () => {
  it("uses one business day line for a single day", () => {
    const plain = slipPlainText(
      buildItemSummarySlip(SUMMARY, { ...OPTIONS, fromKey: "2026-11-04", toKey: "2026-11-04", width: 32 }),
    );
    expect(plain).toMatch(/Business day +Wed, Nov 4, 2026/);
    expect(plain).not.toContain("From");
  });

  it("says there were no sales instead of printing an empty table", () => {
    const empty: ItemSummary = { ...SUMMARY, orders: 0, netCents: 0, itemsNetCents: 0, quantity: 0, ordersWithoutLines: 0, rows: [] };
    const plain = slipPlainText(buildItemSummarySlip(empty, { ...OPTIONS, width: 32 }));
    expect(plain).toContain("No sales in this period");
    expect(plain).toMatch(/NET SALES +0 +0\.00/);
  });

  it("leaves out the branch line when there is none", () => {
    const plain = slipPlainText(buildItemSummarySlip(SUMMARY, { ...OPTIONS, branchName: undefined, width: 32 }));
    expect(plain).not.toContain("Main branch");
  });

  it("prints the coverage notes the screen shows", () => {
    const plain = slipPlainText(buildItemSummarySlip(SUMMARY, { ...OPTIONS, width: 48 }));
    expect(plain).toContain("1 order was saved without its dishes.");
  });
});
