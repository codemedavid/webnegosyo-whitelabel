import {
  buildDailySalesCsv,
  buildDailySalesRows,
  type SalesOrderInput,
} from "./sales-export";

const DAY_MS = 24 * 60 * 60 * 1000;
// Window: [Aug 16 00:00, Aug 19 00:00) Manila — three days.
const WINDOW_START = Date.UTC(2026, 7, 15, 16, 0, 0);
const WINDOW = { startMs: WINDOW_START, endMs: WINDOW_START + 3 * DAY_MS };

function sale(overrides: Partial<SalesOrderInput> = {}): SalesOrderInput {
  return {
    _id: "o1",
    _creationTime: WINDOW_START + 10 * 60 * 60 * 1000, // Aug 16, 10:00 Manila
    total: 100,
    itemCount: 1,
    status: "delivered",
    ...overrides,
  };
}

describe("buildDailySalesRows", () => {
  it("aggregates orders, units, and gross sales per Manila day", () => {
    const rows = buildDailySalesRows(
      [
        sale({ _id: "a", total: 100, itemCount: 1 }),
        sale({ _id: "b", total: 250, itemCount: 3 }),
        sale({ _id: "c", _creationTime: WINDOW_START + DAY_MS + 1, total: 80, itemCount: 2 }),
      ],
      WINDOW
    );

    expect(rows).toEqual([
      { date: "2026-08-16", orders: 2, units: 4, grossSales: 350, avgOrderValue: 175 },
      { date: "2026-08-17", orders: 1, units: 2, grossSales: 80, avgOrderValue: 80 },
      { date: "2026-08-18", orders: 0, units: 0, grossSales: 0, avgOrderValue: 0 },
    ]);
  });

  it("includes zero rows for days without sales so the series has no gaps", () => {
    const rows = buildDailySalesRows([], WINDOW);
    expect(rows.map((r) => r.date)).toEqual(["2026-08-16", "2026-08-17", "2026-08-18"]);
    expect(rows.every((r) => r.orders === 0 && r.grossSales === 0)).toBe(true);
  });

  it("excludes cancelled orders from every figure", () => {
    const rows = buildDailySalesRows(
      [sale({ _id: "ok", total: 100 }), sale({ _id: "void", total: 900, status: "cancelled" })],
      WINDOW
    );
    expect(rows[0].orders).toBe(1);
    expect(rows[0].grossSales).toBe(100);
  });

  it("ignores orders outside the window", () => {
    const rows = buildDailySalesRows(
      [sale({ _id: "before", _creationTime: WINDOW.startMs - 1, total: 500 })],
      WINDOW
    );
    expect(rows.every((r) => r.grossSales === 0)).toBe(true);
  });

  it("rounds the average order value to centavos", () => {
    const rows = buildDailySalesRows(
      [sale({ _id: "a", total: 100 }), sale({ _id: "b", total: 101 }), sale({ _id: "c", total: 100 })],
      WINDOW
    );
    expect(rows[0].avgOrderValue).toBe(100.33);
  });
});

describe("buildDailySalesCsv", () => {
  it("emits the day rows plus a TOTAL row", () => {
    const csv = buildDailySalesCsv(
      [sale({ _id: "a", total: 100, itemCount: 1 }), sale({ _id: "b", total: 250, itemCount: 3 })],
      WINDOW
    );
    const lines = csv.split("\r\n");

    expect(lines[0]).toContain("Date,Orders,Units,Gross Sales,Avg Order Value");
    expect(lines[1]).toBe("2026-08-16,2,4,350,175");
    expect(lines[lines.length - 1]).toBe("TOTAL,2,4,350,175");
  });
});
