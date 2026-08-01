import {
  shouldRegisterPushToken,
  pushTokenCleanup,
  pushRegistrationOutletId,
} from "./push-registration";

/**
 * A superadmin who opens a tenant's merchant view had their device token
 * written into that tenant's Convex `pushTokens` table, and exiting the view
 * never removed it. The token therefore accumulated across every store the
 * superadmin had ever opened, so one merchant's order rang every one of those
 * phones. Found live in 3 deployments (coffee-mode, brewdazeexpress,
 * chefscollective-kapebilidad) for a single superadmin account.
 *
 * Order alerts belong to the people who work the store, not to whoever is
 * looking at it from the platform side.
 */

const MERCHANT = {
  isAuthenticated: true,
  userId: "user-admin",
  convexUrl: "https://coffee.convex.cloud",
  isSuperadmin: false,
  impersonatedTenantId: null,
};

const SUPERADMIN_IN_TENANT = {
  isAuthenticated: true,
  userId: "user-super",
  convexUrl: "https://coffee.convex.cloud",
  isSuperadmin: true,
  impersonatedTenantId: "tenant-1",
};

describe("shouldRegisterPushToken", () => {
  it("registers the merchant who actually works the store", () => {
    expect(shouldRegisterPushToken(MERCHANT)).toBe(true);
  });

  it("does not register a superadmin viewing someone else's store", () => {
    expect(shouldRegisterPushToken(SUPERADMIN_IN_TENANT)).toBe(false);
  });

  it("does not register a superadmin on the platform surface", () => {
    expect(
      shouldRegisterPushToken({
        ...SUPERADMIN_IN_TENANT,
        convexUrl: null,
        impersonatedTenantId: null,
      })
    ).toBe(false);
  });

  it("registers a superadmin who is also the store's own admin", () => {
    // Not impersonating: this is their own tenant session, so alerts are theirs.
    expect(
      shouldRegisterPushToken({ ...SUPERADMIN_IN_TENANT, impersonatedTenantId: null })
    ).toBe(true);
  });

  it("does not register before login", () => {
    expect(shouldRegisterPushToken({ ...MERCHANT, isAuthenticated: false })).toBe(false);
  });

  it("does not register without a convex deployment to register against", () => {
    expect(shouldRegisterPushToken({ ...MERCHANT, convexUrl: null })).toBe(false);
  });

  it("does not register without a user id", () => {
    expect(shouldRegisterPushToken({ ...MERCHANT, userId: null })).toBe(false);
  });
});

describe("pushTokenCleanup", () => {
  it("clears the superadmin's leftover registration when they open a store", () => {
    // Self-healing: devices that leaked a token before this fix shipped drop it
    // the next time the superadmin opens that same store.
    expect(pushTokenCleanup(SUPERADMIN_IN_TENANT)).toEqual({
      convexUrl: "https://coffee.convex.cloud",
      userId: "user-super",
    });
  });

  it("never clears a merchant's own registration", () => {
    expect(pushTokenCleanup(MERCHANT)).toBeNull();
  });

  it("has nothing to clear without a deployment or user", () => {
    expect(pushTokenCleanup({ ...SUPERADMIN_IN_TENANT, convexUrl: null })).toBeNull();
    expect(pushTokenCleanup({ ...SUPERADMIN_IN_TENANT, userId: null })).toBeNull();
  });
});

/**
 * Which branch a device registers under.
 *
 * The backend rings only the devices bound to an order's branch, so this value
 * decides what a phone hears. It must come from the *account* — the branch the
 * signed-in user is confined to — and never from an owner's drill-down
 * selection: a token outlives the screen that wrote it, so registering under a
 * viewed branch would leave an owner permanently deaf to every other branch
 * after they backed out of it.
 */
describe("pushRegistrationOutletId", () => {
  it("binds a branch manager's device to their branch", () => {
    expect(
      pushRegistrationOutletId({ ...MERCHANT, outletId: "outlet-north" })
    ).toBe("outlet-north");
  });

  it("leaves an owner's device store-wide, so it hears every branch", () => {
    // An owner has no branch on their account. Undefined is the wire value for
    // "no branch", which the backend reads as every branch.
    expect(pushRegistrationOutletId({ ...MERCHANT, outletId: null })).toBeUndefined();
  });

  it("treats a blank branch as store-wide", () => {
    expect(pushRegistrationOutletId({ ...MERCHANT, outletId: "   " })).toBeUndefined();
  });
});
