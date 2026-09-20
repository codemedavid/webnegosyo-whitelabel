import { MIN_BRANCHES_FOR_PORTFOLIO, isPortfolioAvailable } from "./portfolio-landing";
import type { BranchScope } from "./branch-scope";

/**
 * Whether the branch screens exist for an account at all.
 *
 * This one predicate decides the Branches sections in both hubs, the Branches
 * card on Home, and the two Business tabs — so a regression here shows up as
 * "the branch screens vanished" for an owner or, worse, as every branch's
 * takings offered to a manager who runs one.
 */

const ALL: BranchScope = { kind: "all" };
const NORTH: BranchScope = { kind: "branch", outletId: "outlet-north" };

describe("isPortfolioAvailable", () => {
  it("offers the branch screens to a store-wide account with several branches", () => {
    expect(isPortfolioAvailable({ accountScope: ALL, activeOutletCount: 2 })).toBe(true);
  });

  it("hides them below the branch threshold", () => {
    expect(isPortfolioAvailable({ accountScope: ALL, activeOutletCount: 1 })).toBe(false);
    expect(isPortfolioAvailable({ accountScope: ALL, activeOutletCount: 0 })).toBe(false);
  });

  it("hides them from a branch account, however many branches exist", () => {
    // A manager's day is their own branch. A portfolio of one row would be a
    // worse screen than the orders they came to work.
    expect(isPortfolioAvailable({ accountScope: NORTH, activeOutletCount: 5 })).toBe(false);
  });

  it("hides them from the demo tour", () => {
    // The demo is a scripted look at a working store; a branch chooser makes
    // the app look like an admin console.
    expect(isPortfolioAvailable({ accountScope: ALL, activeOutletCount: 5, isDemo: true })).toBe(
      false,
    );
  });

  it("treats an unknown branch count as single-location", () => {
    // The count arrives from a query. Until it does, the sections stay absent
    // rather than flash into view and out again.
    expect(isPortfolioAvailable({ accountScope: ALL, activeOutletCount: null })).toBe(false);
  });

  it("needs at least two branches, since one branch is the whole store", () => {
    expect(MIN_BRANCHES_FOR_PORTFOLIO).toBe(2);
  });
});
