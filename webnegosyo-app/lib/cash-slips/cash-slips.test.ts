/**
 * The three cash slips print through the kitchen chit's path (one text
 * segment), so what is pinned here is what reaches the paper: every line fits
 * the roll (32 / 48 columns), every byte is printable ASCII (a thermal head's
 * code page has no ₱), a hidden (blind) report carries no money, an unknown
 * figure prints "--" rather than 0, and every slip says it is not an official
 * receipt — never "X-READING" / "Z-READING".
 */
import type { ShiftSalesReport } from "../cash/shift-sales";
import type { PrintSegment } from "../printer";
import { buildDayCloseSlip, type DayCloseSlipInput } from "./day-close";
import { buildRemittanceSlip, type RemittanceSlipInput } from "./remittance-slip";
import { HIDDEN_TOTALS_LINE, NO_TOTALS_LINE, buildShiftReportSlip } from "./shift-report";
import { DEVICE_SOURCE_LINE, slipBusinessDay, slipMoney, slipPlainText, slipSafe, slipWindow, visibleLength, wrap } from "./slip-text";

const WIDTHS = [32, 48] as const;
const PRINTED_AT = new Date("2026-10-24T18:50:00.000Z"); // Sun Oct 25, 2:50 AM Manila
const STORE = { storeName: "Loly's Café", branchName: "Main branch", printedAt: PRINTED_AT };

const REPORT: ShiftSalesReport = {
  source: "server",
  hidden: false,
  window: { from: "2026-10-24T10:02:00.000Z", to: "2026-10-24T18:48:00.000Z" },
  shift: {
    id: "shift-1",
    staffName: "Ana Reyes",
    drawerName: "Cashier 1",
    openedAt: "2026-10-24T10:02:00.000Z",
    closedAt: "2026-10-24T18:48:00.000Z",
    businessDay: "2026-10-24",
    servicePeriodName: "Night shift",
  },
  summary: {
    orders: 42,
    grossCents: 1534500,
    discountCents: 34500,
    netCents: 1500000,
    serviceChargeCents: 0,
    deliveryCents: 12000,
    collectedCents: 1490500,
    unpaidCents: 21500,
    overpaidCents: 0,
    voidCount: 2,
    voidCents: 15000,
    refundCents: 0,
  },
  payments: [
    { key: "cash", label: "Cash", cents: 921500, count: 25 },
    { key: "gcash", label: "GCash", cents: 421000, count: 14 },
    { key: "card", label: "Card", cents: 148000, count: 3 },
  ],
  orderTypes: [
    { key: "dine_in", label: "Dine in", orders: 30, netCents: 1100000 },
    { key: "pickup", label: "Pickup", orders: 12, netCents: 400000 },
  ],
  channels: null,
  items: null,
  receipts: [
    { orderId: "o1", number: "#01", placedAt: "2026-10-24T10:05:00.000Z", orderTypeLabel: "Dine in", methodLabel: "Cash", totalCents: 25000, status: "paid" },
    { orderId: "o42", number: "#42", placedAt: "2026-10-24T18:40:00.000Z", orderTypeLabel: "Pickup", methodLabel: "GCash", totalCents: 18000, status: "paid" },
  ],
  receiptsTruncated: true,
  firstNumber: "#01",
  lastNumber: "#42",
};

const HIDDEN: ShiftSalesReport = {
  ...REPORT,
  hidden: true,
  shift: REPORT.shift ? { ...REPORT.shift, closedAt: null } : null,
  summary: null,
  payments: null,
  orderTypes: null,
  receipts: REPORT.receipts.map((r) => ({ ...r, totalCents: null })),
  receiptsTruncated: false,
};

const REMITTANCE: RemittanceSlipInput = {
  slipNumber: "R-0241",
  businessDay: "2026-10-24",
  drawerName: "Cashier 1",
  cashierName: "Ana Reyes",
  shiftOpenedAt: "2026-10-24T10:02:00.000Z",
  shiftClosedAt: "2026-10-24T18:48:00.000Z",
  startingCashCents: 200000,
  cashSalesCents: 921500,
  payInCents: 20000,
  payOutCents: 45000,
  pickups: [{ cents: 250000, takenByName: "Maria", at: "2026-10-24T13:40:00.000Z" }],
  expectedCents: 846500,
  countedCents: 834500,
  reasonKey: "wrong_change",
  reasonNote: "gave ₱100 extra to T4",
  floatKeptCents: 200000,
  handedOverCents: 634500,
  nonCash: [
    { label: "GCash", count: 14, cents: 421000, check: "matches" },
    { label: "Maya", count: 3, cents: 86000, check: "different", declaredCents: 81000 },
    { label: "Card", count: 2, cents: 76000, check: "unchecked" },
  ],
  denominations: { b1000: 4, b500: 3, b100: 7, b50: 6, b20: 9, c10: 12, c5: 8, c1: 23, c025: 4 },
  receiver: { name: "Maria Santos", status: "pending" },
};

const DAY_CLOSE: DayCloseSlipInput = {
  businessDay: "2026-10-24",
  windowStart: "2026-10-23T20:00:00.000Z",
  windowEnd: "2026-10-24T20:00:00.000Z",
  version: 1,
  closedByName: "Maria Santos",
  closedAt: "2026-10-24T19:10:00.000Z",
  sales: {
    orders: 118,
    netCents: 4122000,
    discountCents: 51000,
    collectedByMethod: [
      { label: "Cash", cents: 2461500 },
      { label: "GCash", cents: 984000 },
      { label: "Maya", cents: 215000 },
      { label: "Card", cents: 461500 },
    ],
    unpaidCents: 0,
    overpaidCents: 0,
  },
  shifts: [
    { staffName: "Ana", drawerName: "Cashier 1", closeKind: "counted", handedOverCents: 634500, differenceCents: -12000, remittanceStatus: "accepted" },
    { staffName: "Ben", drawerName: "Cashier 2", closeKind: "counted", handedOverCents: 838000, differenceCents: 0, remittanceStatus: "pending" },
    { staffName: "Carlo", drawerName: null, closeKind: "forced", handedOverCents: null, differenceCents: null, remittanceStatus: null },
  ],
  payOutCents: 125000,
  expensesFromDrawerCents: 60000,
  differenceCents: -10000,
  floatsKeptCents: 400000,
  cashToDepositCents: 1985000,
  deposit: { cents: 1970000, to: "BDO savings", ref: "DEP-7731" },
  skipped: ["1 remittance waiting"],
  note: "Ben's envelope in the safe",
};

function textOf(segments: PrintSegment[]): string {
  expect(segments).toHaveLength(1);
  const [segment] = segments;
  if (segment.type !== "text") throw new Error("expected one text segment");
  return segment.text;
}

function expectPrintable(segments: PrintSegment[], width: number): string {
  const text = textOf(segments);
  for (const line of text.split("\n")) {
    expect(visibleLength(line)).toBeLessThanOrEqual(width);
    expect(line).toMatch(/^[\x20-\x7E]*$/);
  }
  expect(text).toContain("Not an official receipt.");
  expect(text).not.toMatch(/READING/i);
  return text;
}

describe.each(WIDTHS)("slips at %i columns", (width) => {
  it("shift report", () => {
    const text = expectPrintable(buildShiftReportSlip(REPORT, { ...STORE, width }), width);
    expect(text).toContain("SHIFT REPORT");
    expect(text).toContain("#01 - #42");
    expect(slipPlainText([{ type: "text", text }])).toMatchSnapshot();
  });

  it("hidden shift report prints no money, but keeps the receipt range and count", () => {
    const text = expectPrintable(buildShiftReportSlip(HIDDEN, { ...STORE, width }), width);
    expect(text).not.toMatch(/\d\.\d\d/);
    expect(text).toContain(HIDDEN_TOTALS_LINE.split(" ")[0]);
    expect(text).toContain("#01 - #42");
    expect(text).toMatch(/Receipt count +2/);
    expect(slipPlainText([{ type: "text", text }])).toMatchSnapshot();
  });

  it("remittance slip", () => {
    const text = expectPrintable(buildRemittanceSlip(REMITTANCE, { ...STORE, width }), width);
    expect(text).toContain("REMITTANCE SLIP");
    expect(text).toMatch(/SHORT +120\.00/);
    expect(text).toMatch(/REMITTED +6,345\.00/);
    expect(text).toContain("Wrong sukli (change)");
    expect(slipPlainText([{ type: "text", text }])).toMatchSnapshot();
  });

  it("day close", () => {
    const text = expectPrintable(buildDayCloseSlip(DAY_CLOSE, { ...STORE, width }), width);
    expect(text).toContain("DAY CLOSE");
    expect(text).toMatch(/CASH TO DEPOSIT +19,850\.00/);
    expect(slipPlainText([{ type: "text", text }])).toMatchSnapshot();
  });
});

describe("unknown is never printed as zero", () => {
  it("a report without totals says so", () => {
    const text = textOf(buildShiftReportSlip({ ...REPORT, summary: null, payments: null }, { ...STORE, width: 32 }));
    expect(text).toContain(NO_TOTALS_LINE.split(" ")[0]);
    expect(text).not.toContain("NET SALES");
  });

  it("a forced close prints -- for what nobody counted", () => {
    const text = textOf(
      buildRemittanceSlip(
        { ...REMITTANCE, expectedCents: null, countedCents: null, handedOverCents: null, cashSalesCents: null },
        { ...STORE, width: 32 },
      ),
    );
    expect(text).toMatch(/Should be in drawer +--/);
    expect(text).toMatch(/Counted +--/);
    expect(text).toMatch(/Difference +--/);
    expect(text).toMatch(/REMITTED +--/);
  });

  it("a drawers-only day close says the sales are not on the slip", () => {
    const text = textOf(buildDayCloseSlip({ ...DAY_CLOSE, sales: null }, { ...STORE, width: 32 }));
    expect(text).not.toContain("NET SALES");
    expect(text.replace(/\s+/g, " ")).toContain("Drawer figures only.");
  });

  it("an exact count says exact, an accepted remittance names how", () => {
    const text = textOf(
      buildRemittanceSlip(
        { ...REMITTANCE, countedCents: 846500, reasonKey: null, receiver: { name: "Maria", status: "accepted", how: "pin", at: "2026-10-24T18:51:00.000Z" } },
        { ...STORE, width: 48 },
      ),
    );
    expect(text).toMatch(/EXACT +0\.00/);
    expect(text).toContain("Accepted by Maria with PIN 2:51 AM");
  });
});

describe("a recount is printed under the count", () => {
  it.each(WIDTHS)("at %i columns", (width) => {
    const text = expectPrintable(buildRemittanceSlip({ ...REMITTANCE, recount: { firstCents: 0, finalCents: 834500 } }, { ...STORE, width }), width);
    const lines = text.split("\n");
    const at = lines.findIndex((line) => line.startsWith("Counted "));
    expect(lines.slice(at + 1).join(" ").replace(/\s+/g, " ")).toMatch(/Counted twice: +0\.00 -> 8,345\.00/);
    expect(slipPlainText([{ type: "text", text }])).toMatchSnapshot();
  });

  it("no recount, no line", () => {
    expect(textOf(buildRemittanceSlip(REMITTANCE, { ...STORE, width: 32 }))).not.toContain("Counted twice");
  });
});

describe("figures added up on the tablet say so", () => {
  it("a shift report from the device carries the line; a server one doesn't", () => {
    const device = textOf(buildShiftReportSlip({ ...REPORT, source: "device" }, { ...STORE, width: 32 }));
    expect(device).toContain(DEVICE_SOURCE_LINE);
    expect(textOf(buildShiftReportSlip(REPORT, { ...STORE, width: 32 }))).not.toContain(DEVICE_SOURCE_LINE);
  });

  it("a remittance whose expected cash came from the tablet carries the line under it", () => {
    const lines = textOf(buildRemittanceSlip({ ...REMITTANCE, expectedSource: "device" }, { ...STORE, width: 32 })).split("\n");
    const at = lines.findIndex((line) => line.startsWith("Should be in drawer"));
    expect(lines[at + 1].trim()).toBe(DEVICE_SOURCE_LINE);
    expect(textOf(buildRemittanceSlip({ ...REMITTANCE, expectedSource: "server" }, { ...STORE, width: 32 }))).not.toContain(DEVICE_SOURCE_LINE);
  });
});

describe("slip text helpers", () => {
  it("slipSafe turns typed text into printable ASCII and drops style tags", () => {
    expect(slipSafe("Loly's Café — ₱100 <B>x</B>")).toBe("Loly's Cafe - P100 Bx/B");
    expect(slipSafe(null)).toBe("");
  });

  it("slipMoney groups thousands, keeps centavos, and prints -- for unknown", () => {
    expect(slipMoney(846500)).toBe("8,465.00");
    expect(slipMoney(-12000)).toBe("-120.00");
    expect(slipMoney(25)).toBe("0.25");
    expect(slipMoney(null)).toBe("--");
  });

  it("dates read in Manila time whatever the device zone", () => {
    // 2026-10-24 is a Saturday (the 06 mockups were drawn on 2025's calendar).
    expect(slipBusinessDay("2026-10-24")).toBe("Sat, Oct 24, 2026");
    expect(slipBusinessDay("nope")).toBe("--");
    expect(slipWindow("2026-10-24T10:02:00.000Z", "2026-10-24T18:48:00.000Z")).toBe("6:02 PM Sat - 2:48 AM Sun");
    expect(slipWindow("2026-10-24T10:02:00.000Z", null)).toBe("6:02 PM Sat - now");
  });

  it("wrap keeps every line inside the paper, even one long word", () => {
    const lines = wrap(`short ${"x".repeat(40)} end`, 32, "  ");
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(32);
    expect(lines[0]).toBe("  short");
  });
});
