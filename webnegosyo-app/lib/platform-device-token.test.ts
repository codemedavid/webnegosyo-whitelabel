// Where this phone files its token for PLATFORM messages (What's New, on-command
// notices). Deliberately separate from order-push registration: order alerts
// depend on the store's order backend, platform messages do not — every
// signed-in merchant device should hear them, whatever serves their orders.

import { platformDeviceRegistration } from "./platform-device-token";

const live = {
  isAuthenticated: true,
  userId: "u1",
  tenantId: "t1",
  isDemo: false,
  isSuperadmin: false,
  impersonatedTenantId: null,
  orderBackend: null,
  convexUrl: null,
};

describe("platformDeviceRegistration", () => {
  it("registers a signed-in merchant under their store, whatever the order backend", () => {
    expect(platformDeviceRegistration(live)).toEqual({ userId: "u1", tenantId: "t1" });
    expect(platformDeviceRegistration({ ...live, orderBackend: "convex", convexUrl: "https://x" }))
      .toEqual({ userId: "u1", tenantId: "t1" });
  });

  it("registers a superadmin on the platform surface with no store", () => {
    expect(
      platformDeviceRegistration({ ...live, isSuperadmin: true, tenantId: null })
    ).toEqual({ userId: "u1", tenantId: null });
  });

  it("never registers the demo, a signed-out shell, or a superadmin viewing a store", () => {
    expect(platformDeviceRegistration({ ...live, isDemo: true })).toBeNull();
    expect(platformDeviceRegistration({ ...live, isAuthenticated: false })).toBeNull();
    expect(platformDeviceRegistration({ ...live, userId: null })).toBeNull();
    expect(
      platformDeviceRegistration({
        ...live,
        isSuperadmin: true,
        tenantId: null,
        impersonatedTenantId: "t9",
      })
    ).toBeNull();
  });
});
