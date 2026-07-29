import { buildPortfolioRows, storeTotals } from "./portfolio-rows";
import { compareBranches } from "./branch-analytics";

/**
 * The portfolio's rows come from two sources that disagree by design: the
 * branch list is the store's own `outlets` rows, while the figures are derived
 * from orders. A branch that has never taken an order exists in the first and
 * not the second, and it must still be on screen — it is the branch most
 * likely to need the owner's attention.
 */

const OUTLETS = [
  { id: "outlet-north", name: "North" },
  { id: "outlet-south", name: "South" },
  { id: "outlet-quiet", name: "Quiet Street" },
];

const ORDERS = [
  { outlet_id: "outlet-north", total: 300, status: "delivered" },
  { outlet_id: "outlet-north", total: 100, status: "delivered" },
  { outlet_id: "outlet-south", total: 200, status: "delivered" },
  { outlet_id: null, total: 50, status: "delivered" },
];

const rows = () => buildPortfolioRows(OUTLETS, compareBranches(ORDERS));

describe("buildPortfolioRows", () => {
  it("ranks branches by revenue", () => {
    expect(rows().slice(0, 2).map((row) => row.outletId)).toEqual([
      "outlet-north",
      "outlet-south",
    ]);
  });

  it("keeps a branch that has never taken an order, at zero", () => {
    const quiet = rows().find((row) => row.outletId === "outlet-quiet");
    expect(quiet).toMatchObject({ outletName: "Quiet Street", revenue: 0, orderCount: 0 });
  });

  it("names branches from the store's list, not from the orders", () => {
    // Orders snapshot the branch name at the time they were taken, so a renamed
    // branch would otherwise show its old name in the portfolio it is being
    // managed from.
    const renamed = buildPortfolioRows(
      [{ id: "outlet-north", name: "North (Ayala)" }],
      compareBranches([{ outlet_id: "outlet-north", total: 10, status: "delivered" }]),
    );
    expect(renamed[0].outletName).toBe("North (Ayala)");
  });

  it("keeps unassigned takings last, and not selectable", () => {
    const last = rows()[rows().length - 1];
    expect(last.outletId).toBeNull();
    expect(last.revenue).toBe(50);
  });

  it("drops an unassigned row that holds nothing", () => {
    const clean = buildPortfolioRows(
      OUTLETS,
      compareBranches([{ outlet_id: "outlet-north", total: 10, status: "delivered" }]),
    );
    expect(clean.every((row) => row.outletId !== null)).toBe(true);
  });

  it("returns every branch even before any orders load", () => {
    expect(buildPortfolioRows(OUTLETS, []).map((row) => row.outletName)).toEqual([
      "North",
      "South",
      "Quiet Street",
    ]);
  });
});

describe("storeTotals", () => {
  it("adds up every row, unassigned included", () => {
    // The store total must match the dashboard's, which knows nothing about
    // branches. Dropping unassigned here would make the portfolio quietly
    // under-report the day.
    expect(storeTotals(rows())).toEqual({ revenue: 650, orderCount: 4 });
  });

  it("reads as zero for a store with no takings", () => {
    expect(storeTotals([])).toEqual({ revenue: 0, orderCount: 0 });
  });
});
