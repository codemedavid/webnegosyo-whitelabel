import { ordersForOutlet, queueForOutlet } from "./orderScope";

/**
 * Backend narrowing of order reads to a single branch.
 *
 * Today `getOrders` and `getRealtimeQueue` return every branch's orders and each
 * screen discards the rows it may not show. A branch manager's device therefore
 * receives other branches' customer names and phone numbers over the wire, and
 * the busiest read in the product ships rows nobody will look at.
 *
 * These are the pure rules behind the `outletId` parameter those two queries
 * gain. Kept free of Convex imports so the platform repo's Jest run can reach
 * them, exactly as `pushRecipients.ts` is.
 *
 * **The visibility rule is the inverse of the notification rule, deliberately.**
 * An unattributed order rings every branch (`pushRecipients.ts` — a missed
 * notification loses the order) but is *hidden* from a branch's order list: it
 * was not taken by that branch, and the list is a record of what that branch
 * did. This mirrors `isOrderInScope` in the app's `branch-scope.ts` exactly —
 * if the two disagree, rows appear or vanish depending on which filter ran last.
 */

const NORTH = "outlet-north";

/** An order as Convex stores it: the branch rides in `customerData`. */
function order(id: string, outletId?: string | null) {
  return {
    _id: id,
    customerName: "Ada",
    customerData: outletId === undefined ? {} : { outlet_id: outletId },
  };
}

describe("ordersForOutlet", () => {
  it("returns only the branch's own orders", () => {
    const rows = [order("a", NORTH), order("b", "outlet-south"), order("c", NORTH)];

    expect(ordersForOutlet(rows, NORTH).map((o) => o._id)).toEqual(["a", "c"]);
  });

  it("hides an unattributed order from a branch", () => {
    // The inverse of the push rule, and it matches the app's `isOrderInScope`.
    // An order with no branch was not taken by this branch.
    const rows = [order("a", NORTH), order("b"), order("c", null)];

    expect(ordersForOutlet(rows, NORTH).map((o) => o._id)).toEqual(["a"]);
  });

  it("returns every order when no branch is asked for", () => {
    // The parameter is optional, so an omitted branch must mean "as before".
    // This is what keeps every single-location tenant unaffected.
    const rows = [order("a", NORTH), order("b")];

    expect(ordersForOutlet(rows, undefined)).toEqual(rows);
    expect(ordersForOutlet(rows, null)).toEqual(rows);
  });

  it("treats a blank branch as no branch rather than matching nothing", () => {
    // A whitespace argument that filtered strictly would return an empty list
    // and read as "this branch has no orders" — a lie the merchant cannot debug.
    const rows = [order("a", NORTH), order("b")];

    expect(ordersForOutlet(rows, "   ")).toEqual(rows);
  });

  it("ignores a malformed customerData instead of throwing", () => {
    // `customerData` is a tenant-writable blob; a query that throws takes the
    // whole orders screen down.
    const rows = [
      { _id: "a", customerData: null },
      { _id: "b", customerData: "not-an-object" },
      { _id: "c", customerData: { outlet_id: 42 } },
      { _id: "d", customerData: { outlet_id: NORTH } },
    ];

    expect(ordersForOutlet(rows, NORTH).map((o) => o._id)).toEqual(["d"]);
  });

  it("does not mutate or reorder the caller's list", () => {
    const rows = [order("a", NORTH), order("b", "outlet-south")];
    const before = JSON.stringify(rows);

    ordersForOutlet(rows, NORTH);

    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe("queueForOutlet", () => {
  it("narrows every status bucket to the branch", () => {
    const queue = {
      pending: [order("a", NORTH), order("b", "outlet-south")],
      confirmed: [order("c", "outlet-south")],
    };

    const scoped = queueForOutlet(queue, NORTH);

    expect(scoped.pending.map((o) => o._id)).toEqual(["a"]);
    expect(scoped.confirmed).toEqual([]);
  });

  it("keeps every bucket present even when a branch has none", () => {
    // The dashboard indexes the buckets by name. A dropped key is a crash, not
    // an empty column.
    const scoped = queueForOutlet({ pending: [], ready: [order("z", "elsewhere")] }, NORTH);

    expect(Object.keys(scoped).sort()).toEqual(["pending", "ready"]);
  });

  it("passes the queue straight through when no branch is asked for", () => {
    const queue = { pending: [order("a", NORTH), order("b")] };

    expect(queueForOutlet(queue, undefined)).toEqual(queue);
  });
});
