import {
  orderOutletIdFromCustomerData,
  recipientsForOutlet,
  resolveOrderOutletId,
  filterOrdersToOutlet,
  type PushTokenLike,
} from "./pushRecipients";

/**
 * Who a new-order notification should ring.
 *
 * Before this, `sendOrderNotification` messaged every registered device, so a
 * two-branch store woke both branches for every sale. Unlike the order lists,
 * this cannot be narrowed on the device: a phone can't un-ring a notification
 * it has already received. That is why the rule lives on the backend.
 *
 * The rule fails toward *noise*, never toward silence — a notification that
 * reaches one extra device is an annoyance, one that reaches nobody loses the
 * order.
 */

function token(overrides: Partial<PushTokenLike> = {}): PushTokenLike {
  return { token: "ExponentPushToken[a]", ...overrides };
}

const NORTH = "outlet-north";
const SOUTH = "outlet-south";

describe("recipientsForOutlet", () => {
  it("rings only the devices bound to the order's branch", () => {
    const north = token({ token: "north-phone", outletId: NORTH });
    const south = token({ token: "south-phone", outletId: SOUTH });

    const recipients = recipientsForOutlet([north, south], NORTH);

    expect(recipients.map((r) => r.token)).toEqual(["north-phone"]);
  });

  it("rings a store-wide device for every branch", () => {
    // An owner's device registers with no branch, so it hears everything.
    const owner = token({ token: "owner-phone", outletId: null });
    const north = token({ token: "north-phone", outletId: NORTH });

    expect(recipientsForOutlet([owner, north], SOUTH).map((r) => r.token)).toEqual([
      "owner-phone",
    ]);
    expect(recipientsForOutlet([owner, north], NORTH).map((r) => r.token)).toEqual([
      "owner-phone",
      "north-phone",
    ]);
  });

  it("treats a device registered before branches existed as store-wide", () => {
    // Tokens written by an older app build carry no `outletId` at all. Reading
    // that as "belongs to no branch, so ring for nothing" would silence every
    // existing device the moment this shipped.
    const legacy = token({ token: "legacy-phone" });

    expect(recipientsForOutlet([legacy], NORTH).map((r) => r.token)).toEqual([
      "legacy-phone",
    ]);
  });

  it("rings every device when the order carries no branch", () => {
    // A single-location store, or an order placed before the branch stamp
    // existed. Filtering by a branch nobody matches would drop the order
    // silently, so an unbranched order reaches everyone — exactly today's
    // behaviour, which is what a one-location merchant must keep.
    const north = token({ token: "north-phone", outletId: NORTH });
    const south = token({ token: "south-phone", outletId: SOUTH });

    expect(recipientsForOutlet([north, south], null).map((r) => r.token)).toEqual([
      "north-phone",
      "south-phone",
    ]);
  });

  it("ignores blank branch ids on both sides", () => {
    // Whitespace is the same as absent. Guarded because the id travels through
    // a JSON blob and a session field, not a typed column.
    const blank = token({ token: "blank-phone", outletId: "   " });

    expect(recipientsForOutlet([blank], NORTH).map((r) => r.token)).toEqual([
      "blank-phone",
    ]);
    expect(recipientsForOutlet([token({ outletId: NORTH })], "  ")).toHaveLength(1);
  });

  it("returns nothing when no device is registered", () => {
    expect(recipientsForOutlet([], NORTH)).toEqual([]);
  });
});

describe("orderOutletIdFromCustomerData", () => {
  it("reads the branch the storefront and register stamp", () => {
    // Written by `withOrderOutlet` on both the web and the merchant app.
    expect(orderOutletIdFromCustomerData({ outlet_id: NORTH })).toBe(NORTH);
  });

  it("is null when the order carries no branch", () => {
    expect(orderOutletIdFromCustomerData({})).toBeNull();
    expect(orderOutletIdFromCustomerData(undefined)).toBeNull();
    expect(orderOutletIdFromCustomerData(null)).toBeNull();
  });

  it("is null for a non-string or blank branch", () => {
    expect(orderOutletIdFromCustomerData({ outlet_id: "  " })).toBeNull();
    expect(orderOutletIdFromCustomerData({ outlet_id: 42 })).toBeNull();
  });
});

/**
 * The branch of an order that may predate the `outletId` column.
 *
 * v15 promotes the branch out of `customerData` into a real field, but every
 * order already in a tenant's database has only the blob. Filtering on the
 * column alone would therefore *hide* every existing branch order — the same
 * trap the platform backend hit, where a naive `.eq('outlet_id')` would have
 * hidden every counter sale from the branch that rang it up.
 */
describe("resolveOrderOutletId", () => {
  it("prefers the column once an order has one", () => {
    expect(
      resolveOrderOutletId({ outletId: "outlet-north", customerData: {} })
    ).toBe("outlet-north");
  });

  it("falls back to the blob for an order written before the column existed", () => {
    // Both live orders on the only multi-branch tenant look exactly like this.
    expect(
      resolveOrderOutletId({ customerData: { outlet_id: "outlet-south" } })
    ).toBe("outlet-south");
  });

  it("is null for an order with no branch anywhere", () => {
    expect(resolveOrderOutletId({})).toBeNull();
    expect(resolveOrderOutletId({ outletId: "  ", customerData: {} })).toBeNull();
  });
});

describe("filterOrdersToOutlet", () => {
  const north = { id: "a", outletId: "outlet-north", customerData: {} };
  const southBlob = { id: "b", customerData: { outlet_id: "outlet-south" } };
  const unbranched = { id: "c", customerData: {} };

  it("keeps only the branch's orders, column or blob", () => {
    const kept = filterOrdersToOutlet([north, southBlob, unbranched], "outlet-south");

    expect(kept.map((o) => o.id)).toEqual(["b"]);
  });

  it("returns every order untouched when no branch is asked for", () => {
    // The store-wide path must not pay for a filter it does not want, and must
    // not drop unbranched orders.
    const all = [north, southBlob, unbranched];

    expect(filterOrdersToOutlet(all, undefined)).toEqual(all);
  });

  it("excludes unbranched orders from a branch view", () => {
    // An order with no branch belongs to no branch. Including it would show a
    // manager a sale from a store-wide channel they cannot act on.
    expect(filterOrdersToOutlet([unbranched], "outlet-north")).toEqual([]);
  });
});
