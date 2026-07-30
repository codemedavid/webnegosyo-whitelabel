/**
 * The five numbers the redesigned Branches screen is built on.
 *
 * The screen deliberately shows five per branch and no more, so each one has to
 * survive scrutiny. These tests pin the definitions — especially the two that
 * are easy to get subtly wrong and impossible to spot afterwards:
 *
 * - **Repeat-guest rate** counts an order as a repeat only when that guest
 *   ordered *earlier in the same window*, and divides by the orders that could
 *   be attributed to a person at all. Dividing by every order would make a
 *   branch with lots of walk-ins look disloyal rather than anonymous.
 * - **Revenue per trading hour** is the normaliser that makes a small branch
 *   comparable to a big one. It counts hours the branch actually traded, so a
 *   branch open half as long is not marked down for it.
 *
 * Cancelled orders are excluded from revenue, count and average — matching
 * `branch-analytics.ts`, `branch-dashboard.ts` and the Convex stats handler —
 * but they are what the cancellation leak is measured from.
 */

import {
  buildBranchKpis,
  hourOfDayVolume,
  storeKpiTotals,
  type KpiOrderLike,
  type KpiPeriod,
} from "./branch-kpis";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 2026-07-20 00:00 Manila == 2026-07-19T16:00Z. */
const PERIOD_START = Date.parse("2026-07-19T16:00:00.000Z");

/** A 7-day window starting at PERIOD_START, ending the instant before day 8. */
const WEEK: KpiPeriod = {
  startMs: PERIOD_START,
  endMs: PERIOD_START + 7 * DAY_MS - 1,
  days: 7,
};

/** Manila noon on day `day` (0-indexed) of the window. */
function manilaNoon(day: number): number {
  return PERIOD_START + day * DAY_MS + 12 * HOUR_MS;
}

function order(overrides: Partial<KpiOrderLike> & { outletId?: string | null }): KpiOrderLike {
  const { outletId, ...rest } = overrides;
  return {
    _creationTime: manilaNoon(0),
    total: 100,
    status: "delivered",
    ...(outletId === undefined ? {} : { outlet_id: outletId }),
    ...rest,
  };
}

function guest(phone: string): { customerData: Record<string, unknown> } {
  return { customerData: { customer_phone: phone } };
}

const OUTLETS = [
  { id: "makati", name: "Makati" },
  { id: "pasig", name: "Pasig" },
];

function rowFor(rows: readonly { outletId: string | null }[], outletId: string | null) {
  const row = rows.find((r) => r.outletId === outletId);
  if (!row) throw new Error(`no row for ${outletId}`);
  return row;
}

describe("buildBranchKpis — membership and totals", () => {
  it("lists every branch the store has, including one that has never traded", () => {
    const rows = buildBranchKpis([order({ outletId: "makati" })], OUTLETS, WEEK);

    expect(rows.map((r) => r.outletName)).toEqual(["Makati", "Pasig"]);
    expect(rowFor(rows, "pasig").revenue).toBe(0);
    expect(rowFor(rows, "pasig").averageOrderValue).toBe(0);
  });

  it("ranks branches by revenue per trading hour, not by raw takings", () => {
    // Pasig takes more money overall, but Makati earns more per hour it trades:
    // the whole point of normalising a multi-branch comparison.
    const orders = [
      order({ outletId: "makati", total: 900, _creationTime: manilaNoon(0) }),
      order({ outletId: "pasig", total: 400, _creationTime: manilaNoon(0) }),
      order({ outletId: "pasig", total: 400, _creationTime: manilaNoon(1) }),
      order({ outletId: "pasig", total: 400, _creationTime: manilaNoon(2) }),
    ];

    const rows = buildBranchKpis(orders, OUTLETS, WEEK);

    expect(rows.map((r) => r.outletId)).toEqual(["makati", "pasig"]);
    expect(rowFor(rows, "makati").revenuePerTradingHour).toBe(900);
    expect(rowFor(rows, "pasig").revenuePerTradingHour).toBe(400);
  });

  it("keeps unattributed takings in a trailing Unassigned row so the figures still add up", () => {
    const orders = [
      order({ outletId: "makati", total: 100 }),
      order({ outletId: null, total: 5_000 }),
    ];

    const rows = buildBranchKpis(orders, OUTLETS, WEEK);

    // Pinned last however much it holds — it is a data-quality bucket, not the
    // store's best branch.
    expect(rows[rows.length - 1].outletId).toBeNull();
    expect(rows[rows.length - 1].outletName).toBe("Unassigned");
    expect(storeKpiTotals(rows).revenue).toBe(5_100);
  });

  it("gives each branch its share of store revenue", () => {
    const orders = [
      order({ outletId: "makati", total: 750 }),
      order({ outletId: "pasig", total: 250 }),
    ];

    const rows = buildBranchKpis(orders, OUTLETS, WEEK);

    expect(rowFor(rows, "makati").revenueShare).toBeCloseTo(0.75);
    expect(rowFor(rows, "pasig").revenueShare).toBeCloseTo(0.25);
  });

  it("reads the branch out of the blob when POS never stamped the column", () => {
    // POS sales carry the branch in customerData only — a naive column filter
    // hides every counter sale from the branch that rang it up.
    const orders = [order({ customerData: { outletId: "makati" }, total: 320 })];

    const rows = buildBranchKpis(orders, OUTLETS, WEEK);

    expect(rowFor(rows, "makati").revenue).toBe(320);
  });
});

describe("buildBranchKpis — the period window", () => {
  it("ignores orders outside the window", () => {
    const orders = [
      order({ outletId: "makati", total: 100, _creationTime: WEEK.startMs }),
      order({ outletId: "makati", total: 100, _creationTime: WEEK.endMs }),
      order({ outletId: "makati", total: 999, _creationTime: WEEK.startMs - 1 }),
      order({ outletId: "makati", total: 999, _creationTime: WEEK.endMs + 1 }),
    ];

    expect(rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati").revenue).toBe(200);
  });

  it("compares against the equal-length window immediately before", () => {
    const orders = [
      order({ outletId: "makati", total: 120, _creationTime: manilaNoon(0) }),
      order({ outletId: "makati", total: 100, _creationTime: manilaNoon(-3) }),
    ];

    const row = rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati");

    expect(row.previousRevenue).toBe(100);
    expect(row.revenueDelta).toBeCloseTo(0.2);
  });

  it("reports no delta rather than an infinite one when there is no baseline", () => {
    const rows = buildBranchKpis([order({ outletId: "makati", total: 500 })], OUTLETS, WEEK);

    expect(rowFor(rows, "makati").previousRevenue).toBe(0);
    expect(rowFor(rows, "makati").revenueDelta).toBeNull();
  });

  it("returns one daily-revenue point per period day, in order, zero-filled", () => {
    const orders = [
      order({ outletId: "makati", total: 100, _creationTime: manilaNoon(0) }),
      order({ outletId: "makati", total: 50, _creationTime: manilaNoon(0) + HOUR_MS }),
      order({ outletId: "makati", total: 70, _creationTime: manilaNoon(6) }),
    ];

    const row = rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati");

    expect(row.dailyRevenue).toEqual([150, 0, 0, 0, 0, 0, 70]);
  });

  it("buckets by Manila days, so a late-evening order stays on its own day", () => {
    // 23:30 Manila on day 0 is already the next day in UTC. Bucketing by UTC
    // would move every dinner service onto tomorrow.
    const lateEvening = manilaNoon(0) + 11 * HOUR_MS + 30 * 60 * 1000;
    const orders = [order({ outletId: "makati", total: 400, _creationTime: lateEvening })];

    const row = rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati");

    expect(row.dailyRevenue[0]).toBe(400);
    expect(row.dailyRevenue[1]).toBe(0);
  });
});

describe("buildBranchKpis — cancellation leak", () => {
  it("excludes cancelled orders from revenue, count and average", () => {
    const orders = [
      order({ outletId: "makati", total: 200 }),
      order({ outletId: "makati", total: 800, status: "cancelled" }),
    ];

    const row = rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati");

    expect(row.revenue).toBe(200);
    expect(row.orderCount).toBe(1);
    expect(row.averageOrderValue).toBe(200);
  });

  it("measures the leak from the same cancelled orders", () => {
    const orders = [
      order({ outletId: "makati", total: 200 }),
      order({ outletId: "makati", total: 200 }),
      order({ outletId: "makati", total: 800, status: "cancelled" }),
    ];

    const row = rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati");

    expect(row.cancelledCount).toBe(1);
    expect(row.lostRevenue).toBe(800);
    expect(row.cancellationRate).toBeCloseTo(1 / 3);
  });

  it("reads zero leak for a branch with nothing cancelled", () => {
    const rows = buildBranchKpis([order({ outletId: "makati" })], OUTLETS, WEEK);

    expect(rowFor(rows, "makati").cancellationRate).toBe(0);
  });
});

describe("buildBranchKpis — repeat-guest rate", () => {
  it("counts a guest's later orders as repeats, never their first", () => {
    const orders = [
      order({ outletId: "makati", ...guest("09171111111"), _creationTime: manilaNoon(0) }),
      order({ outletId: "makati", ...guest("09171111111"), _creationTime: manilaNoon(1) }),
      order({ outletId: "makati", ...guest("09171111111"), _creationTime: manilaNoon(2) }),
      order({ outletId: "makati", ...guest("09172222222"), _creationTime: manilaNoon(3) }),
    ];

    // 2 of 4 identified orders were placed by someone who had ordered before.
    expect(rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati").repeatRate).toBeCloseTo(0.5);
  });

  it("joins the same guest across the phone formats they typed", () => {
    const orders = [
      order({ outletId: "makati", ...guest("09171234567"), _creationTime: manilaNoon(0) }),
      order({ outletId: "makati", ...guest("+639171234567"), _creationTime: manilaNoon(1) }),
    ];

    expect(rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati").repeatRate).toBeCloseTo(0.5);
  });

  it("divides by identified orders only, so walk-ins do not read as disloyalty", () => {
    const orders = [
      order({ outletId: "makati", ...guest("09171111111"), _creationTime: manilaNoon(0) }),
      order({ outletId: "makati", ...guest("09171111111"), _creationTime: manilaNoon(1) }),
      order({ outletId: "makati", contact: "walk-in", _creationTime: manilaNoon(2) }),
      order({ outletId: "makati", contact: "POS", _creationTime: manilaNoon(3) }),
    ];

    const row = rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati");

    expect(row.repeatRate).toBeCloseTo(0.5);
    // Reported alongside so the screen can say how much of the branch it knows.
    expect(row.identifiedShare).toBeCloseTo(0.5);
  });

  it("reads zero — not NaN — for a branch whose guests are all anonymous", () => {
    const orders = [order({ outletId: "makati", contact: "POS" })];

    const row = rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati");

    expect(row.repeatRate).toBe(0);
    expect(row.identifiedShare).toBe(0);
  });

  it("does not credit a cancelled order as a visit", () => {
    const orders = [
      order({
        outletId: "makati",
        ...guest("09171111111"),
        status: "cancelled",
        _creationTime: manilaNoon(0),
      }),
      order({ outletId: "makati", ...guest("09171111111"), _creationTime: manilaNoon(1) }),
    ];

    expect(rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati").repeatRate).toBe(0);
  });

  it("keeps each branch's repeat rate to its own guests", () => {
    // The same guest ordering once from each branch is a first visit at both.
    const orders = [
      order({ outletId: "makati", ...guest("09171111111"), _creationTime: manilaNoon(0) }),
      order({ outletId: "pasig", ...guest("09171111111"), _creationTime: manilaNoon(1) }),
    ];

    const rows = buildBranchKpis(orders, OUTLETS, WEEK);

    expect(rowFor(rows, "makati").repeatRate).toBe(0);
    expect(rowFor(rows, "pasig").repeatRate).toBe(0);
  });
});

describe("buildBranchKpis — revenue per trading hour", () => {
  it("counts each distinct hour the branch traded once, however many orders it took", () => {
    const orders = [
      order({ outletId: "makati", total: 100, _creationTime: manilaNoon(0) }),
      order({ outletId: "makati", total: 100, _creationTime: manilaNoon(0) + 10 * 60 * 1000 }),
      order({ outletId: "makati", total: 100, _creationTime: manilaNoon(0) + HOUR_MS }),
    ];

    const row = rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati");

    expect(row.tradingHours).toBe(2);
    expect(row.revenuePerTradingHour).toBe(150);
  });

  it("does not count an hour in which everything was cancelled as trading", () => {
    const orders = [
      order({ outletId: "makati", total: 100, _creationTime: manilaNoon(0) }),
      order({
        outletId: "makati",
        total: 900,
        status: "cancelled",
        _creationTime: manilaNoon(1),
      }),
    ];

    const row = rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati");

    expect(row.tradingHours).toBe(1);
    expect(row.revenuePerTradingHour).toBe(100);
  });

  it("reads zero for a branch that never traded", () => {
    const rows = buildBranchKpis([], OUTLETS, WEEK);

    expect(rowFor(rows, "makati").tradingHours).toBe(0);
    expect(rowFor(rows, "makati").revenuePerTradingHour).toBe(0);
  });
});

describe("buildBranchKpis — untyped rows from three backends", () => {
  it("degrades a malformed row to zero rather than NaN across the whole comparison", () => {
    const orders = [
      { outlet_id: "makati", total: "not-a-number", status: "delivered", _creationTime: manilaNoon(0) },
      { outlet_id: "makati", total: null, status: "delivered", _creationTime: manilaNoon(0) },
      order({ outletId: "makati", total: 100 }),
    ] as KpiOrderLike[];

    const row = rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati");

    expect(row.revenue).toBe(100);
    expect(Number.isFinite(row.averageOrderValue)).toBe(true);
  });

  it("skips a row with no usable timestamp instead of dropping it into day zero", () => {
    const orders = [
      order({ outletId: "makati", total: 500, _creationTime: undefined }),
      order({ outletId: "makati", total: 100 }),
    ];

    expect(rowFor(buildBranchKpis(orders, OUTLETS, WEEK), "makati").revenue).toBe(100);
  });

  it("handles an empty store without throwing", () => {
    expect(buildBranchKpis([], [], WEEK)).toEqual([]);
    expect(storeKpiTotals([])).toEqual({
      revenue: 0,
      orderCount: 0,
      averageOrderValue: 0,
      dailyRevenue: [],
      previousRevenue: 0,
      revenueDelta: null,
    });
  });
});

describe("storeKpiTotals", () => {
  it("adds the branches up into the store's own headline", () => {
    const orders = [
      order({ outletId: "makati", total: 300, _creationTime: manilaNoon(0) }),
      order({ outletId: "pasig", total: 100, _creationTime: manilaNoon(6) }),
      order({ outletId: "makati", total: 200, _creationTime: manilaNoon(-2) }),
    ];

    const totals = storeKpiTotals(buildBranchKpis(orders, OUTLETS, WEEK));

    expect(totals.revenue).toBe(400);
    expect(totals.orderCount).toBe(2);
    expect(totals.averageOrderValue).toBe(200);
    expect(totals.dailyRevenue).toEqual([300, 0, 0, 0, 0, 0, 100]);
    expect(totals.previousRevenue).toBe(200);
    expect(totals.revenueDelta).toBeCloseTo(1);
  });
});

describe("hourOfDayVolume", () => {
  it("returns 24 Manila-hour buckets", () => {
    const buckets = hourOfDayVolume([order({ _creationTime: manilaNoon(0) })], WEEK);

    expect(buckets).toHaveLength(24);
    expect(buckets[12]).toBe(1);
    expect(buckets.reduce((sum, n) => sum + n, 0)).toBe(1);
  });

  it("puts a late-evening order in the evening, not after midnight", () => {
    const elevenPm = manilaNoon(0) + 11 * HOUR_MS;

    expect(hourOfDayVolume([order({ _creationTime: elevenPm })], WEEK)[23]).toBe(1);
  });

  it("ignores cancelled orders and anything outside the window", () => {
    const orders = [
      order({ _creationTime: manilaNoon(0), status: "cancelled" }),
      order({ _creationTime: WEEK.endMs + HOUR_MS }),
    ];

    expect(hourOfDayVolume(orders, WEEK).reduce((sum, n) => sum + n, 0)).toBe(0);
  });
});
