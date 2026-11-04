/**
 * The cashier's end-of-shift SHIFT REPORT (her own sales): what reaches the
 * paper is pinned at both roll widths — every line fits, ASCII only, items
 * sold with quantity and amount (58 mm: name, then qty + amount; 80 mm: one
 * line), "Items total" = net, voids, her drawer, signature lines. Blind and
 * uncounted prints no money at all; unknown is "--" or said in words, never 0.
 * Never titled X/Z-READING.
 */
import type { ShiftSalesReport } from "../cash/shift-sales";
import type { PrintSegment } from "../printer";
import { buildShiftReportSlip } from "./shift-report";
import { ITEMS_UNAVAILABLE_LINE } from "./shift-report-cashier";
import { slipPlainText, visibleLength } from "./slip-text";

const WIDTHS = [32, 48] as const;
const PRINTED_AT = new Date("2026-10-20T12:05:00.000Z"); // Tue Oct 20, 8:05 PM Manila
const STORE = { storeName: "Loly's Café", branchName: "Main branch", printedAt: PRINTED_AT };

const MINE: ShiftSalesReport = {
  source: "server",
  scope: "cashier",
  hidden: false,
  window: { from: "2026-10-20T02:00:00.000Z", to: "2026-10-20T12:00:00.000Z" },
  shift: {
    id: "s1",
    staffName: "Jenica Santos",
    drawerName: "Cashier 1",
    openedAt: "2026-10-20T02:00:00.000Z",
    closedAt: "2026-10-20T12:00:00.000Z",
    businessDay: "2026-10-20",
    servicePeriodName: null,
  },
  summary: {
    orders: 3,
    grossCents: 122050,
    discountCents: 5000,
    netCents: 117050,
    serviceChargeCents: 0,
    deliveryCents: 0,
    collectedCents: 117050,
    unpaidCents: 0,
    overpaidCents: 0,
    voidCount: 1,
    voidCents: 21000,
    refundCents: 5000,
  },
  payments: [
    { key: "cash", label: "Cash", cents: 65000, count: 2 },
    { key: "gcash", label: "GCash", cents: 52050, count: 1 },
  ],
  orderTypes: [{ key: "dine_in", label: "Dine In", orders: 3, netCents: 117050 }],
  channels: [{ key: "counter", label: "Counter (POS)", orders: 3, netCents: 117050 }],
  items: [
    { label: "Adobo", quantity: 5, netCents: 70000 },
    { label: "Halo-halo", quantity: 2, netCents: 30000 },
    { label: "Rice", quantity: 2, netCents: 5000 },
    { label: "Iced Spanish Latte with Oat Milk (Large, Extra Shot)", quantity: 1.5, netCents: 12050 },
  ],
  itemsTruncated: false,
  receipts: [
    { orderId: "o7", number: "#07", placedAt: "2026-10-20T04:00:00.000Z", orderTypeLabel: "Dine In", methodLabel: "Cash", totalCents: 30000, status: "paid" },
    { orderId: "o1", number: "#01", placedAt: "2026-10-20T02:05:00.000Z", orderTypeLabel: "Dine In", methodLabel: "Cash", totalCents: 35000, status: "paid" },
  ],
  receiptsTruncated: false,
  firstNumber: "#01",
  lastNumber: "#07",
  voids: [{ orderId: "o3", number: "#03", placedAt: "2026-10-20T03:00:00.000Z", totalCents: 21000, status: "void" }],
  voidsTruncated: false,
  cash: {
    floatCents: 50000,
    cashSalesCents: 115000,
    payInCents: 10000,
    payOutCents: 4000,
    collectedCents: 0,
    expectedCents: 171000,
    expectedSource: "server",
    countedCents: 166000,
    differenceCents: -5000,
  },
  otherCollections: { count: 1, cents: 99900 },
};

const OPEN_HIDDEN: ShiftSalesReport = {
  ...MINE,
  hidden: true,
  shift: MINE.shift ? { ...MINE.shift, closedAt: null } : null,
  summary: null,
  payments: null,
  orderTypes: null,
  channels: null,
  items: null,
  receipts: MINE.receipts.map((r) => ({ ...r, totalCents: null })),
  voids: MINE.voids?.map((v) => ({ ...v, totalCents: null })) ?? null,
  cash: null,
  otherCollections: null,
};

function textOf(segments: PrintSegment[]): string {
  expect(segments).toHaveLength(1);
  const [segment] = segments;
  if (segment.type !== "text") throw new Error("expected one text segment");
  return segment.text;
}

function printable(report: ShiftSalesReport, width: 32 | 48): string {
  const text = textOf(buildShiftReportSlip(report, { ...STORE, width }));
  for (const line of text.split("\n")) {
    expect(visibleLength(line)).toBeLessThanOrEqual(width);
    expect(line).toMatch(/^[\x20-\x7E]*$/);
  }
  expect(text).toContain("Not an official receipt.");
  expect(text).not.toMatch(/READING/i);
  return text;
}

describe.each(WIDTHS)("cashier shift report at %i columns", (width) => {
  it("prints her sales, items, voids, drawer and signature lines", () => {
    const text = printable(MINE, width);
    expect(text).toContain("SHIFT REPORT");
    expect(text).toContain("Closed");
    expect(text).toMatch(/Cashier +Jenica Santos/);
    expect(text).toMatch(/NET SALES +1,170\.50/);
    expect(text).toContain("ITEMS SOLD");
    expect(text).toMatch(/Items total +1,170\.50/);
    expect(text).toContain("VOIDS");
    expect(text).toMatch(/#03/);
    expect(text).toMatch(/SHORT +50\.00/);
    expect(text).toMatch(/Cash taken \(net\) +1,150\.00/);
    expect(text).toMatch(/Other bills +1 +999\.00/);
    expect(text).toContain("Cashier signature:");
    expect(text).toContain("Checked by:");
    expect(slipPlainText([{ type: "text", text }])).toMatchSnapshot();
  });

  it("blind and uncounted prints no money anywhere, says So far, keeps receipt range and void numbers", () => {
    const text = printable(OPEN_HIDDEN, width);
    expect(text).toContain("So far");
    expect(text).not.toMatch(/\d\.\d\d/);
    expect(text).toContain("#01 - #07");
    expect(text).toMatch(/#03/);
    expect(slipPlainText([{ type: "text", text }])).toMatchSnapshot();
  });

  it("words change handed back on a colleague's bill as change given, never as negative other bills", () => {
    const report: ShiftSalesReport = {
      ...MINE,
      cash: MINE.cash ? { ...MINE.cash, cashSalesCents: -15500, expectedCents: 40500 } : null,
      otherCollections: { count: 1, cents: -15500 },
    };
    const text = printable(report, width);
    expect(text).toMatch(/Cash taken \(net\) +-155\.00/);
    expect(text.replace(/\s+/g, " ")).toMatch(/Change given on other bills -155\.00/);
    expect(text.replace(/\s+/g, " ")).toContain("Handed back on 1 bill rung earlier or by others.");
    expect(text).not.toMatch(/Other bills/);
    expect(text).not.toMatch(/Cash sales/);
    expect(slipPlainText([{ type: "text", text }])).toMatchSnapshot();
  });

  it("says when not every item fits", () => {
    const text = printable({ ...MINE, itemsTruncated: true }, width);
    expect(text.replace(/\s+/g, " ")).toContain("Only the 500 most sold are listed");
    expect(slipPlainText([{ type: "text", text }])).toMatchSnapshot();
  });
});

describe("cashier shift report details", () => {
  it("58 mm puts each item name on its own line, then quantity and amount", () => {
    const lines = printable(MINE, 32).split("\n");
    const at = lines.indexOf("Adobo");
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 1]).toMatch(/^ +x5 +700\.00$/);
    // A long name wraps instead of being cut.
    expect(lines.join(" ")).toMatch(/Iced Spanish Latte with Oat/);
    expect(lines.some((line) => /^ +x1\.5 +120\.50$/.test(line))).toBe(true);
  });

  it("80 mm keeps one line per item", () => {
    const text = printable(MINE, 48);
    expect(text).toMatch(/\nAdobo +x5 +700\.00\n/);
  });

  it("items sorted by quantity, then sales", () => {
    const shuffled = { ...MINE, items: [...(MINE.items ?? [])].reverse() };
    const lines = printable(shuffled, 48).split("\n");
    const names = ["Adobo", "Halo-halo", "Rice", "Iced Spanish"].map((name) => lines.findIndex((line) => line.startsWith(name)));
    expect(names).toEqual([...names].sort((a, b) => a - b));
  });

  it("a tablet count without items says items are not available, never an empty list", () => {
    const text = printable({ ...MINE, source: "device", items: null, cash: null, otherCollections: null }, 32);
    expect(text.replace(/\s+/g, " ")).toContain(ITEMS_UNAVAILABLE_LINE);
    expect(text).toContain("Counted on this tablet");
    expect(text).not.toContain("Items total");
  });

  it("an open shift not counted yet prints the drawer so far, and Counted as not yet", () => {
    const open: ShiftSalesReport = {
      ...MINE,
      shift: MINE.shift ? { ...MINE.shift, closedAt: null } : null,
      cash: MINE.cash ? { ...MINE.cash, countedCents: null, differenceCents: null } : null,
    };
    const text = printable(open, 32);
    expect(text).toContain("So far");
    expect(text).toMatch(/Counted +not yet/);
    expect(text).not.toMatch(/SHORT|OVER|EXACT/);
  });

  it("no voids says so", () => {
    expect(printable({ ...MINE, voids: [] }, 32)).toMatch(/No voids/);
  });

  it("the store's window report is untouched (no items, no signature)", () => {
    const text = printable({ ...MINE, scope: "window" }, 32);
    expect(text).not.toContain("ITEMS SOLD");
    expect(text).not.toContain("Cashier signature");
  });
});
