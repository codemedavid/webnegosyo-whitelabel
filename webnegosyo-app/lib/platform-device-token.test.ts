// Where this phone files its token for PLATFORM messages (What's New, on-command
// notices). Deliberately separate from order-push registration: order alerts
// depend on the store's order backend, platform messages do not — every
// signed-in merchant device should hear them, whatever serves their orders.

import { isMissingColumnError, platformDeviceRegistration, platformDeviceTokenRow } from "./platform-device-token";

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

describe("platformDeviceTokenRow", () => {
  const input = { token: "ExponentPushToken[x]", userId: "u1", tenantId: "t1" };

  it("reports the Android channels this install created", () => {
    expect(platformDeviceTokenRow({ ...input, channels: ["approvals"] }, "android", "2026-10-12T00:00:00.000Z", true)).toEqual({
      token: "ExponentPushToken[x]",
      user_id: "u1",
      tenant_id: "t1",
      platform: "android",
      last_seen_at: "2026-10-12T00:00:00.000Z",
      channels: ["approvals"],
    });
  });

  it("leaves the column out for a database that does not have it yet", () => {
    const row = platformDeviceTokenRow({ ...input, channels: ["approvals"] }, "ios", "2026-10-12T00:00:00.000Z", false);
    expect(row).not.toHaveProperty("channels");
    expect(row.platform).toBe("ios");
  });
});

describe("isMissingColumnError", () => {
  it("recognises PostgREST's unknown-column refusal and Postgres' undefined column", () => {
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'channels' column of 'platform_device_tokens' in the schema cache" }, "channels")).toBe(true);
    expect(isMissingColumnError({ code: "42703", message: 'column "channels" of relation "platform_device_tokens" does not exist' }, "channels")).toBe(true);
    expect(isMissingColumnError({ code: "42501", message: "permission denied" }, "channels")).toBe(false);
    expect(isMissingColumnError(null, "channels")).toBe(false);
  });
});
