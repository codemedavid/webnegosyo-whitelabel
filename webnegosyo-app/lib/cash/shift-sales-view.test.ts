import {
  drawerLens,
  heroLines,
  paidByRows,
  RECEIPT_PILLS,
  receiptAmount,
  receiptRangeText,
  searchReceipts,
  shiftSalesSubtitle,
  shiftSalesTitle,
  sourceNote,
} from "./shift-sales-view";
import type { ShiftSalesReceipt, ShiftSalesReport, ShiftSalesSummary } from "./shift-sales";

const SUMMARY: ShiftSalesSummary = {
  orders: 36,
  grossCents: 1_250_000,
  discountCents: 12_000,
  netCents: 1_238_000,
  serviceChargeCents: 0,
  deliveryCents: 0,
  collectedCents: 1_188_000,
  unpaidCents: 50_000,
  overpaidCents: 0,
  voidCount: 1,
  voidCents: 34_000,
  refundCents: 0,
};

function receipt(orderId: string, number: string, placedAt: string, totalCents: number | null): ShiftSalesReceipt {
  return { orderId, number, placedAt, orderTypeLabel: "Dine-in", methodLabel: "Cash", totalCents, status: "paid" };
}

function report(overrides: Partial<ShiftSalesReport> = {}): ShiftSalesReport {
  return {
    source: "server",
    hidden: false,
    window: { from: "2026-10-24T04:00:00.000Z", to: "2026-10-24T12:00:00.000Z" },
    shift: {
      id: "s1",
      staffName: "Ana",
      drawerName: "Cashier 1",
      openedAt: "2026-10-24T04:02:00.000Z",
      closedAt: null,
      businessDay: "2026-10-24",
      servicePeriodName: "Day shift",
    },
    summary: SUMMARY,
    payments: null,
    orderTypes: null,
    channels: null,
    items: null,
    receipts: [],
    receiptsTruncated: false,
    firstNumber: "#01",
    lastNumber: "#37",
    ...overrides,
  };
}

describe("header", () => {
  it("names the shift by its service period, else just 'Shift'", () => {
    expect(shiftSalesTitle(report().shift, null)).toBe("Day shift");
    expect(shiftSalesTitle({ ...report().shift!, servicePeriodName: null }, null)).toBe("Shift");
    expect(shiftSalesTitle(null, "Night shift")).toBe("Night shift");
  });

  it("says the business day, the window, the cashier and the drawer in one line", () => {
    expect(shiftSalesSubtitle(report(), "2026-10-24T08:00:00.000Z", null)).toBe("Today · 12:02 PM – now · Ana · Cashier 1");
    const closed = report({ shift: { ...report().shift!, closedAt: "2026-10-24T12:01:00.000Z" } });
    expect(shiftSalesSubtitle(closed, "2026-10-26T08:00:00.000Z", null)).toBe("Sat, 24 Oct 2026 · 12:02 PM – 8:01 PM · Ana · Cashier 1");
  });

  it("labels figures that are not the store's report", () => {
    expect(sourceNote("server")).toBeNull();
    expect(sourceNote("device")).toBe("Counted on this tablet");
    expect(sourceNote("sample")).toMatch(/demo/);
  });
});

describe("hero", () => {
  it("gives the receipt range and how many receipts, voids included", () => {
    expect(receiptRangeText(report())).toBe("#01 – #37 · 37 receipts");
    expect(receiptRangeText(report({ summary: null, firstNumber: null, lastNumber: null }))).toBe("No receipts yet");
  });

  it("counts receipts from the list when the money is hidden, with a + when the list was cut", () => {
    const hidden = report({
      summary: null,
      hidden: true,
      receiptsTruncated: true,
      receipts: [receipt("a", "#01", "2026-10-24T04:10:00Z", null), receipt("b", "#02", "2026-10-24T04:20:00Z", null)],
    });
    expect(receiptRangeText(hidden)).toBe("#01 – #37 · 2+ receipts");
  });

  it("puts discounts with voids, and still-unpaid in words when nothing is owed", () => {
    expect(heroLines(report())).toEqual([
      { key: "discounts", label: "Discounts · voids", value: "₱120 · 1 void ₱340", isAttention: false },
      { key: "unpaid", label: "Still unpaid", value: "₱500", isAttention: true },
    ]);
    const settled = heroLines(report({ summary: { ...SUMMARY, unpaidCents: 0, voidCount: 0, refundCents: 2000 } }));
    expect(settled.map((l) => l.value)).toEqual(["₱120 · No voids", "Nothing unpaid", "₱20"]);
  });

  it("draws no hero lines for an unknown summary rather than zeros", () => {
    expect(heroLines(report({ summary: null }))).toEqual([]);
  });
});

describe("paidByRows", () => {
  it("scales bars to the largest method and gives each its share", () => {
    const rows = paidByRows([
      { key: "cash", label: "Cash", cents: 750_000, count: 30 },
      { key: "gcash", label: "GCash", cents: 250_000, count: 1 },
    ]);
    expect(rows).toEqual([
      { key: "cash", label: "Cash", amount: "₱7,500", meta: "30 payments", fraction: 1, share: "75%" },
      { key: "gcash", label: "GCash", amount: "₱2,500", meta: "1 payment", fraction: 1 / 3, share: "25%" },
    ]);
  });
});

describe("searchReceipts", () => {
  const list = [
    receipt("a", "#09", "2026-10-24T04:10:00Z", 35_000),
    receipt("b", "#12", "2026-10-24T05:10:00Z", 125_050),
    receipt("c", "#120", "2026-10-24T06:10:00Z", 9_900),
  ];

  it("lists newest first", () => {
    expect(searchReceipts(list, "").map((r) => r.orderId)).toEqual(["c", "b", "a"]);
  });

  it("finds a receipt by its number, with or without #, ignoring leading zeros", () => {
    expect(searchReceipts(list, "12").map((r) => r.orderId)).toEqual(["b"]);
    expect(searchReceipts(list, "#9").map((r) => r.orderId)).toEqual(["a"]);
    expect(searchReceipts(list, "009").map((r) => r.orderId)).toEqual(["a"]);
  });

  it("finds a receipt by its exact amount", () => {
    expect(searchReceipts(list, "350").map((r) => r.orderId)).toEqual(["a"]);
    expect(searchReceipts(list, "₱1,250.50").map((r) => r.orderId)).toEqual(["b"]);
  });

  it("never matches an amount it cannot see", () => {
    const hidden = list.map((r) => ({ ...r, totalCents: null }));
    expect(searchReceipts(hidden, "350")).toEqual([]);
  });
});

describe("receipt pills and amounts", () => {
  it("gives every status a word and an icon, not only a colour", () => {
    for (const pill of Object.values(RECEIPT_PILLS)) {
      expect(pill.label.length).toBeGreaterThan(0);
      expect(pill.icon.length).toBeGreaterThan(0);
    }
  });

  it("says Hidden for a blind receipt and a dash for an unknown one, never ₱0", () => {
    expect(receiptAmount(receipt("a", "#1", "x", null), true)).toBe("Hidden");
    expect(receiptAmount(receipt("a", "#1", "x", null), false)).toBe("—");
    expect(receiptAmount(receipt("a", "#1", "x", 0), false)).toBe("₱0");
  });
});

describe("drawerLens", () => {
  it("turns the Drawer's peso summary into whole centavos", () => {
    expect(
      drawerLens({ saleCount: 3, grossTotal: 0, cashTotal: 1234.56, nonCashTotal: 0.1, changeGiven: 50, refundsPaid: 0.2 }),
    ).toEqual({ cashCents: 123456, nonCashCents: 10, changeCents: 5000, refundCents: 20, sales: 3 });
  });
});
