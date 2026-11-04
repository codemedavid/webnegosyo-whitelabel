import { myShiftRow, printableReport, printStateText, PRINTED_TEXT, REPRINTED_TEXT, reportSummaryLine } from "./shift-report-actions";
import type { ShiftSalesReport } from "./shift-sales";

const REPORT = {
  source: "server",
  scope: "cashier",
  hidden: false,
  window: { from: "a", to: "b" },
  shift: null,
  summary: { orders: 3, netCents: 117050 },
  payments: [],
  orderTypes: [],
  channels: [],
  items: [],
  receipts: [],
  receiptsTruncated: false,
  firstNumber: null,
  lastNumber: null,
} as unknown as ShiftSalesReport;

describe("printStateText", () => {
  it("a reprint of an old shift just says Printed. (no hand-over instruction)", () => {
    expect(REPRINTED_TEXT).toBe("Printed.");
    expect(printStateText({ status: "printed" }, REPRINTED_TEXT)).toBe("Printed.");
    expect(printStateText({ status: "printing" }, REPRINTED_TEXT)).toBe("Printing…");
  });

  it("says printing, printed, or the printer's own words", () => {
    expect(printStateText({ status: "idle" })).toBeNull();
    expect(printStateText({ status: "printing" })).toBe("Printing…");
    expect(printStateText({ status: "printed" })).toBe(PRINTED_TEXT);
    expect(printStateText({ status: "failed", message: "No receipt printer" })).toBe("No receipt printer");
  });
});

describe("reportSummaryLine", () => {
  it("counts sales and money, and never shows ₱0 for hidden or unknown", () => {
    expect(reportSummaryLine(REPORT)).toBe("3 sales · ₱1,170.50");
    expect(reportSummaryLine({ ...REPORT, summary: { ...REPORT.summary!, orders: 1 } })).toMatch(/^1 sale ·/);
    expect(reportSummaryLine({ ...REPORT, hidden: true, summary: null })).toBe("Totals show once you count the drawer.");
    expect(reportSummaryLine({ ...REPORT, summary: null })).toBe("Sales totals are not available here.");
  });
});

describe("printableReport", () => {
  it("only a server report prints on the spot", () => {
    expect(printableReport({ ok: true, reply: { kind: "report", report: REPORT } })).toBe(REPORT);
    expect(printableReport({ ok: true, reply: { kind: "unavailable" } })).toBeNull();
    expect(printableReport({ ok: false, kind: "not_set_up", message: "x" })).toBeNull();
    expect(printableReport(null)).toBeNull();
  });
});

describe("myShiftRow", () => {
  const opts = { nowIso: "2026-11-04T06:00:00.000Z", isLoading: false, dayKeyOf: () => "2026-11-04" };
  const shift = { id: "s1", openedAt: "2026-11-04T04:00:00.000Z", closedAt: "2026-11-04T12:00:00.000Z", status: "closed" as const, businessDay: "2026-11-04" };

  it("shows the day, the hours and her net", () => {
    const row = myShiftRow(shift, { status: "ok", orders: 3, netCents: 117050 }, opts);
    expect(row).toMatchObject({ id: "s1", day: "Today", net: "₱1,170.50 · 3 sales", isOpen: false });
    expect(row.times).toMatch(/–/);
  });

  it("an open shift ends 'now'; hidden and unknown never read as ₱0", () => {
    expect(myShiftRow({ ...shift, closedAt: null, status: "open" }, undefined, { ...opts, isLoading: true })).toMatchObject({ isOpen: true, net: "Adding up…" });
    expect(myShiftRow({ ...shift, closedAt: null, status: "open" }, undefined, opts).times).toMatch(/now$/);
    expect(myShiftRow(shift, { status: "hidden", orders: null, netCents: null }, opts).net).toBe("Hidden until counted");
    expect(myShiftRow(shift, { status: "unavailable", orders: null, netCents: null }, opts).net).toBe("See report");
  });
});
