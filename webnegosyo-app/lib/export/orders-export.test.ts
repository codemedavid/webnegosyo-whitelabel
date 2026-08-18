import {
  buildOrdersCsv,
  filterOrdersForExport,
  groupItemsByOrder,
  resolveExportCoverage,
  summarizeItems,
  type ExportOrderInput,
  type ExportOrderItemInput,
} from "./orders-export";

const DAY_MS = 24 * 60 * 60 * 1000;
// Window: [Aug 12 00:00, Aug 19 00:00) Manila.
const WINDOW_START = Date.UTC(2026, 7, 11, 16, 0, 0);
const WINDOW = { startMs: WINDOW_START, endMs: WINDOW_START + 7 * DAY_MS };

function order(overrides: Partial<ExportOrderInput> = {}): ExportOrderInput {
  return {
    _id: "o1",
    _creationTime: WINDOW_START + 2 * DAY_MS, // Aug 14 00:00 Manila
    customerName: "Juan",
    total: 250,
    itemCount: 2,
    status: "delivered",
    ...overrides,
  };
}

describe("filterOrdersForExport", () => {
  it("keeps only orders inside the half-open window", () => {
    const inside = order({ _id: "in" });
    const before = order({ _id: "before", _creationTime: WINDOW.startMs - 1 });
    const atEnd = order({ _id: "atEnd", _creationTime: WINDOW.endMs });
    const atStart = order({ _id: "atStart", _creationTime: WINDOW.startMs });

    const kept = filterOrdersForExport([inside, before, atEnd, atStart], { window: WINDOW });

    expect(kept.map((o) => o._id)).toEqual(["in", "atStart"]);
  });

  it("filters by status when one is given", () => {
    const delivered = order({ _id: "d", status: "delivered" });
    const cancelled = order({ _id: "c", status: "cancelled" });

    const kept = filterOrdersForExport([delivered, cancelled], {
      window: WINDOW,
      status: "cancelled",
    });

    expect(kept.map((o) => o._id)).toEqual(["c"]);
  });

  it("keeps every status when no status filter is given", () => {
    const kept = filterOrdersForExport(
      [order({ _id: "a", status: "pending" }), order({ _id: "b", status: "cancelled" })],
      { window: WINDOW }
    );
    expect(kept).toHaveLength(2);
  });
});

describe("summarizeItems", () => {
  it("renders quantity, name, and variation per line, joined with semicolons", () => {
    const items: ExportOrderItemInput[] = [
      { orderId: "o1", menuItemName: "Burger", quantity: 2, subtotal: 300, variation: "Large" },
      { orderId: "o1", menuItemName: "Coke", quantity: 1, subtotal: 50 },
    ];
    expect(summarizeItems(items)).toBe("2x Burger (Large); 1x Coke");
  });

  it("returns an empty string for no items", () => {
    expect(summarizeItems([])).toBe("");
  });
});

describe("groupItemsByOrder", () => {
  it("indexes items under their order id", () => {
    const items: ExportOrderItemInput[] = [
      { orderId: "a", menuItemName: "Burger", quantity: 1, subtotal: 150 },
      { orderId: "b", menuItemName: "Coke", quantity: 1, subtotal: 50 },
      { orderId: "a", menuItemName: "Fries", quantity: 1, subtotal: 80 },
    ];
    const grouped = groupItemsByOrder(items);
    expect(grouped.get("a")?.map((i) => i.menuItemName)).toEqual(["Burger", "Fries"]);
    expect(grouped.get("b")?.map((i) => i.menuItemName)).toEqual(["Coke"]);
  });
});

describe("buildOrdersCsv", () => {
  it("emits one row per order with the merchant-facing columns", () => {
    const o = order({
      _id: "ord-1",
      customerName: "Maria Cruz",
      customerContact: "+639171234567",
      orderType: "delivery",
      source: "web",
      paymentMethod: "GCash",
      paymentStatus: "paid",
      deliveryFee: 49,
      total: 349,
      amountPaid: 349,
    });
    const items = groupItemsByOrder([
      { orderId: "ord-1", menuItemName: "Burger", quantity: 2, subtotal: 300 },
    ]);

    const csv = buildOrdersCsv([o], items);
    const lines = csv.split("\r\n");

    expect(lines[0]).toContain("Order ID,Date,Time,Status,Type,Source,Customer,Contact,Items");
    expect(lines).toHaveLength(2);
    // Aug 14 00:00 Manila; the phone is formula-guarded for Excel.
    expect(lines[1]).toBe(
      "ord-1,2026-08-14,00:00,delivered,delivery,web,Maria Cruz,'+639171234567," +
        "2x Burger,2,GCash,paid,49,349,349"
    );
  });

  it("renders rows newest first", () => {
    const older = order({ _id: "old" });
    const newer = order({ _id: "new", _creationTime: WINDOW_START + 3 * DAY_MS });

    const csv = buildOrdersCsv([older, newer], new Map());
    const dataLines = csv.split("\r\n").slice(1);

    expect(dataLines[0].startsWith("new,")).toBe(true);
    expect(dataLines[1].startsWith("old,")).toBe(true);
  });

  it("leaves optional columns empty rather than printing undefined", () => {
    const csv = buildOrdersCsv([order({ _id: "bare" })], new Map());
    const row = csv.split("\r\n")[1];
    expect(row).not.toContain("undefined");
  });
});

describe("resolveExportCoverage", () => {
  it("reports complete when the fetch did not hit its cap", () => {
    const coverage = resolveExportCoverage({
      fetchedCount: 120,
      fetchLimit: 2000,
      oldestFetchedMs: WINDOW.startMs + DAY_MS,
      window: WINDOW,
    });
    expect(coverage).toEqual({ isComplete: true, effectiveStartMs: WINDOW.startMs });
  });

  it("reports the truncated start when the cap cut into the requested window", () => {
    // 2000 orders fetched and the oldest one is INSIDE the window: anything
    // older existed but was not fetched, so the export must not claim the
    // full range.
    const oldest = WINDOW.startMs + 3 * DAY_MS;
    const coverage = resolveExportCoverage({
      fetchedCount: 2000,
      fetchLimit: 2000,
      oldestFetchedMs: oldest,
      window: WINDOW,
    });
    expect(coverage).toEqual({ isComplete: false, effectiveStartMs: oldest });
  });

  it("stays complete at the cap when the oldest fetched order predates the window", () => {
    const coverage = resolveExportCoverage({
      fetchedCount: 2000,
      fetchLimit: 2000,
      oldestFetchedMs: WINDOW.startMs - DAY_MS,
      window: WINDOW,
    });
    expect(coverage.isComplete).toBe(true);
  });

  it("treats an empty fetch as complete", () => {
    const coverage = resolveExportCoverage({
      fetchedCount: 0,
      fetchLimit: 2000,
      oldestFetchedMs: undefined,
      window: WINDOW,
    });
    expect(coverage).toEqual({ isComplete: true, effectiveStartMs: WINDOW.startMs });
  });
});
