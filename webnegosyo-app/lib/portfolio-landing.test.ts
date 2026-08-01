import {
  MIN_BRANCHES_FOR_PORTFOLIO,
  isPortfolioAvailable,
  landingWorkspace,
} from "./portfolio-landing";
import type { BranchScope } from "./branch-scope";

/**
 * Where an account lands, and whether the portfolio exists for it at all.
 *
 * The portfolio replaces the order queue as the first thing an owner sees, so
 * the rule that selects it is the one place a regression would show up as
 * "the app opens somewhere else now" for merchants who never asked for any of
 * this. Every single-location store and every branch account must land exactly
 * where it does today.
 */

const ALL: BranchScope = { kind: "all" };
const NORTH: BranchScope = { kind: "branch", outletId: "outlet-north" };

describe("landingWorkspace", () => {
  it("opens the portfolio for a store-wide account running several branches", () => {
    expect(landingWorkspace({ accountScope: ALL, activeOutletCount: 3 })).toBe("business");
  });

  it("opens the order queue for a single-location store", () => {
    expect(landingWorkspace({ accountScope: ALL, activeOutletCount: 1 })).toBe("operations");
  });

  it("opens the order queue for a store with no branches configured", () => {
    expect(landingWorkspace({ accountScope: ALL, activeOutletCount: 0 })).toBe("operations");
  });

  it("opens the order queue for a branch manager, however many branches exist", () => {
    // A manager's day is the queue at their branch. A portfolio of one row
    // would be a worse first screen than the orders they came to work.
    expect(landingWorkspace({ accountScope: NORTH, activeOutletCount: 4 })).toBe("operations");
  });

  it("opens the order queue for the demo tour", () => {
    // The demo is a scripted look at a working store; dropping a reviewer on a
    // branch chooser makes the app look like an admin console.
    expect(landingWorkspace({ accountScope: ALL, activeOutletCount: 3, isDemo: true })).toBe(
      "operations",
    );
  });

  it("treats an unknown branch count as single-location", () => {
    // The count arrives from a query. Until it does, the app must open where it
    // always has rather than flash a portfolio and navigate away.
    expect(landingWorkspace({ accountScope: ALL, activeOutletCount: null })).toBe("operations");
  });
});

describe("isPortfolioAvailable", () => {
  it("offers the view to a store-wide account with several branches", () => {
    expect(isPortfolioAvailable({ accountScope: ALL, activeOutletCount: 2 })).toBe(true);
  });

  it("hides the view below the branch threshold", () => {
    expect(isPortfolioAvailable({ accountScope: ALL, activeOutletCount: 1 })).toBe(false);
  });

  it("hides the view from a branch account", () => {
    expect(isPortfolioAvailable({ accountScope: NORTH, activeOutletCount: 5 })).toBe(false);
  });

  it("hides the view from the demo tour", () => {
    expect(isPortfolioAvailable({ accountScope: ALL, activeOutletCount: 5, isDemo: true })).toBe(
      false,
    );
  });

  it("needs at least two branches, since one branch is the whole store", () => {
    expect(MIN_BRANCHES_FOR_PORTFOLIO).toBe(2);
  });
});
