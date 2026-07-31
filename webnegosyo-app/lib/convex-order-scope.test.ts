import { convexOrderQueryArgs, CONVEX_BRANCH_SCOPED_REFS } from "./convex-order-scope";
import type { BranchScope } from "./branch-scope";

/**
 * Whether a Convex order query asks the backend to narrow to a branch.
 *
 * Until now the Convex path fetched every branch's orders and each screen threw
 * away the rows it could not show, so a manager's device received other
 * branches' customer names and phone numbers over the wire. Schema v15 lets the
 * query ask for one branch instead.
 *
 * The constraint that shapes this: a Convex deployment running an older bundle
 * REJECTS an argument its validator does not know, and `hooks.ts` reads that
 * rejection as "this store needs a backend update" and blanks the screen. Most
 * tenants are several versions behind. So the argument may only be sent when it
 * is actually needed — a branch-scoped account, which by definition only exists
 * on a tenant that has branches and therefore is one we deploy.
 *
 * A store-wide account must produce args that are *byte-identical* to today's.
 */

const ALL: BranchScope = { kind: "all" };
const NORTH: BranchScope = { kind: "branch", outletId: "outlet-north" };

describe("convexOrderQueryArgs", () => {
  it("asks the backend for one branch when the account is confined to one", () => {
    expect(convexOrderQueryArgs("orders:getOrders", { limit: 50 }, NORTH)).toEqual({
      limit: 50,
      outletId: "outlet-north",
    });
  });

  it("sends exactly today's arguments for a store-wide account", () => {
    // The regression guard for every single-location tenant on an older bundle:
    // an added key would fail their validator and blank the orders screen. Not
    // `outletId: undefined` — the key must be absent.
    const args = convexOrderQueryArgs("orders:getOrders", { limit: 50 }, ALL);

    expect(args).toEqual({ limit: 50 });
    expect("outletId" in (args as object)).toBe(false);
  });

  it("never adds the argument to a query that cannot accept it", () => {
    // Only the order reads gained the parameter in v15. Sending it to anything
    // else is the same validator rejection, self-inflicted.
    const args = convexOrderQueryArgs("analytics:getTopItems", { days: 7 }, NORTH);

    expect(args).toEqual({ days: 7 });
  });

  it("scopes the live queue as well as the list", () => {
    // The queue is what rings and what the dashboard shows; leaving it unscoped
    // would keep shipping other branches' rows through the busiest read.
    expect(
      convexOrderQueryArgs("orders:getRealtimeQueue", {}, NORTH)
    ).toEqual({ outletId: "outlet-north" });
  });

  it("passes a skipped query through untouched", () => {
    // "skip" is Convex's sentinel for "do not run"; treating it as an object
    // would turn a deliberately idle query into a live one.
    expect(convexOrderQueryArgs("orders:getOrders", "skip", NORTH)).toBe("skip");
  });

  it("treats absent args as an empty argument object", () => {
    expect(convexOrderQueryArgs("orders:getOrders", undefined, NORTH)).toEqual({
      outletId: "outlet-north",
    });
    expect(convexOrderQueryArgs("orders:getOrders", undefined, ALL)).toEqual({});
  });

  it("does not let a caller's own outletId survive a store-wide scope", () => {
    // Defensive: the scope decides, not the screen. A stale literal left in a
    // screen's args must not silently narrow an owner's view.
    expect(convexOrderQueryArgs("orders:getOrders", { outletId: "stale" }, ALL)).toEqual(
      {}
    );
  });

  it("lists only refs whose backend validator accepts a branch", () => {
    // Locked so adding a ref here without adding the arg in the Convex template
    // is a visible change, not a silent screen-blanking for every stale tenant.
    expect([...CONVEX_BRANCH_SCOPED_REFS].sort()).toEqual([
      "orders:getOrders",
      "orders:getRealtimeQueue",
    ]);
  });
});

describe("a ref that only newer deployments understand", () => {
  /**
   * `orders:getDashboardStatsByPeriod` learned `outletId` in schema v18. The
   * two v15 refs above are deliberately NOT version-gated — a branch-scoped
   * account only exists on a tenant that has branches, which is a tenant on
   * v15. That reasoning does not extend to v18: a tenant can have branches and
   * still be running v15, v16 or v17, and sending the argument there blanks the
   * screen rather than degrading.
   */
  const branch = { kind: "branch", outletId: "north" } as const;
  const STATS = "orders:getDashboardStatsByPeriod";

  it("narrows the takings once the deployment is new enough", () => {
    const args = convexOrderQueryArgs(STATS, { startDate: 1, endDate: 2 }, branch, 18);

    expect(args).toEqual({ startDate: 1, endDate: 2, outletId: "north" });
  });

  it("sends no branch key to a deployment that would reject it", () => {
    // Not `outletId: undefined` — the validator still sees the key.
    const args = convexOrderQueryArgs(STATS, { startDate: 1, endDate: 2 }, branch, 17);

    expect(args).toEqual({ startDate: 1, endDate: 2 });
  });

  it("treats an unknown version as the oldest", () => {
    const args = convexOrderQueryArgs(STATS, { startDate: 1, endDate: 2 }, branch);

    expect(args).toEqual({ startDate: 1, endDate: 2 });
  });

  it("leaves the v15 refs ungated, exactly as they are today", () => {
    // Their narrowing must not regress for tenants whose version this app has
    // never had to know.
    const args = convexOrderQueryArgs("orders:getOrders", {}, branch);

    expect(args).toEqual({ outletId: "north" });
  });

  it("adds nothing for a store-wide account whatever the version", () => {
    const args = convexOrderQueryArgs(STATS, { startDate: 1 }, { kind: "all" }, 18);

    expect(args).toEqual({ startDate: 1 });
  });
});
