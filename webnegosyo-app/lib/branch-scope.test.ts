import {
  resolveBranchScope,
  isOrderInScope,
  filterOrdersToScope,
  getOrderOutletId,
} from "./branch-scope";

/**
 * The merchant app's copy of the branch rules.
 *
 * One difference from the web module it mirrors, and it is the whole reason
 * this cannot be a blind copy: orders reach the app from Convex, where the
 * blob is `customerData` (camelCase). The web module reads `customer_data`,
 * the platform-Supabase column name. Reading the wrong key would hide every
 * order from every branch account — the failure would look like an empty
 * store, not like a bug.
 */

const north = { kind: "branch", outletId: "outlet-north" } as const;
const all = { kind: "all" } as const;

describe("resolveBranchScope", () => {
  it("gives an account with no branch the whole store", () => {
    expect(resolveBranchScope({ outletId: null })).toEqual({ kind: "all" });
  });

  it("gives a superadmin the whole store even while impersonating", () => {
    expect(resolveBranchScope({ outletId: "outlet-north", isSuperadmin: true })).toEqual({
      kind: "all",
    });
  });

  it("gives the owner the whole store", () => {
    expect(resolveBranchScope({ outletId: "outlet-north", isOwner: true })).toEqual({
      kind: "all",
    });
  });

  it("confines a branch account to its branch", () => {
    expect(resolveBranchScope({ outletId: "outlet-north" })).toEqual({
      kind: "branch",
      outletId: "outlet-north",
    });
  });

  it("reads a blank branch as the whole store", () => {
    expect(resolveBranchScope({ outletId: "  " })).toEqual({ kind: "all" });
  });

  it("gives a demo session the whole store", () => {
    expect(resolveBranchScope({ outletId: "outlet-north", isDemo: true })).toEqual({
      kind: "all",
    });
  });
});

describe("getOrderOutletId", () => {
  it("reads the branch from the Convex customerData blob", () => {
    expect(getOrderOutletId({ customerData: { outlet_id: "outlet-north" } })).toBe("outlet-north");
  });

  it("prefers an explicit column when the platform adapter supplies one", () => {
    expect(
      getOrderOutletId({ outlet_id: "outlet-north", customerData: { outlet_id: "outlet-south" } })
    ).toBe("outlet-north");
  });

  it("returns nothing for an unattributed order", () => {
    expect(getOrderOutletId({ customerData: {} })).toBeNull();
  });

  it("tolerates a missing blob", () => {
    expect(getOrderOutletId({})).toBeNull();
  });

  it("tolerates a malformed blob rather than throwing", () => {
    expect(getOrderOutletId({ customerData: "not-an-object" })).toBeNull();
    expect(getOrderOutletId({ customerData: { outlet_id: 42 } })).toBeNull();
    expect(getOrderOutletId(null)).toBeNull();
  });
});

describe("isOrderInScope", () => {
  it("shows a branch account its own order", () => {
    expect(isOrderInScope(north, { customerData: { outlet_id: "outlet-north" } })).toBe(true);
  });

  it("hides another branch's order", () => {
    expect(isOrderInScope(north, { customerData: { outlet_id: "outlet-south" } })).toBe(false);
  });

  it("hides an unattributed order from a branch account", () => {
    expect(isOrderInScope(north, { customerData: {} })).toBe(false);
  });

  it("shows everything to an all-branch account", () => {
    expect(isOrderInScope(all, { customerData: {} })).toBe(true);
  });
});

describe("filterOrdersToScope", () => {
  const orders = [
    { _id: "1", customerData: { outlet_id: "outlet-north" } },
    { _id: "2", customerData: { outlet_id: "outlet-south" } },
    { _id: "3", customerData: {} },
  ];

  it("returns the same array for an all-branch account", () => {
    expect(filterOrdersToScope(all, orders)).toBe(orders);
  });

  it("keeps only the account's own branch", () => {
    expect(filterOrdersToScope(north, orders).map((o) => o._id)).toEqual(["1"]);
  });

  it("passes undefined through as an empty list", () => {
    // Convex queries return undefined while loading; screens must not crash.
    expect(filterOrdersToScope(north, undefined)).toEqual([]);
  });

  it("passes undefined through for an all-branch account too", () => {
    expect(filterOrdersToScope(all, undefined)).toEqual([]);
  });
});
