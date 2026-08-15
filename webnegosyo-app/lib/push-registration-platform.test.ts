/**
 * Push registration for tenants on the shared platform Supabase backend.
 *
 * Registration only ever wrote to the viewed tenant's Convex `pushTokens`
 * table, and `shouldRegisterPushToken` required a `convexUrl` — so a
 * platform-backend merchant never registered a device at all and heard nothing
 * when the app was backgrounded. The platform equivalent writes the token into
 * the shared `public.push_tokens` table, where a database trigger on `orders`
 * fans new-order pushes out to it.
 *
 * The superadmin rule carries over unchanged: a platform operator viewing a
 * merchant's store is a spectator — never registered, and any token an earlier
 * build leaked into that tenant is removed on entry.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  shouldRegisterPushToken,
  platformPushRegistration,
  platformPushCleanup,
} from "./push-registration";

const PLATFORM_MERCHANT = {
  isAuthenticated: true,
  userId: "user-admin",
  convexUrl: null,
  orderBackend: "platform" as const,
  tenantId: "tenant-1",
  isSuperadmin: false,
  impersonatedTenantId: null,
};

const CONVEX_MERCHANT = {
  isAuthenticated: true,
  userId: "user-admin",
  convexUrl: "https://coffee.convex.cloud",
  orderBackend: "convex" as const,
  tenantId: "tenant-1",
  isSuperadmin: false,
  impersonatedTenantId: null,
};

describe("shouldRegisterPushToken on the platform backend", () => {
  it("registers a platform-backend merchant despite having no Convex url", () => {
    expect(shouldRegisterPushToken(PLATFORM_MERCHANT)).toBe(true);
  });

  it("still refuses a superadmin viewing a platform store", () => {
    expect(
      shouldRegisterPushToken({
        ...PLATFORM_MERCHANT,
        userId: "user-super",
        isSuperadmin: true,
        impersonatedTenantId: "tenant-1",
      })
    ).toBe(false);
  });

  it("still refuses the per-tenant-Supabase track, which has no send path", () => {
    expect(
      shouldRegisterPushToken({ ...PLATFORM_MERCHANT, orderBackend: "supabase" })
    ).toBe(false);
  });
});

describe("platformPushRegistration", () => {
  it("targets the merchant's tenant with their account branch", () => {
    expect(
      platformPushRegistration({ ...PLATFORM_MERCHANT, outletId: "outlet-north" })
    ).toEqual({ tenantId: "tenant-1", userId: "user-admin", outletId: "outlet-north" });
  });

  it("registers an owner store-wide", () => {
    expect(platformPushRegistration(PLATFORM_MERCHANT)).toEqual({
      tenantId: "tenant-1",
      userId: "user-admin",
      outletId: null,
    });
  });

  it("returns null for a Convex tenant — that path already works", () => {
    expect(platformPushRegistration(CONVEX_MERCHANT)).toBeNull();
  });

  it("returns null while impersonating", () => {
    expect(
      platformPushRegistration({
        ...PLATFORM_MERCHANT,
        userId: "user-super",
        isSuperadmin: true,
        impersonatedTenantId: "tenant-1",
      })
    ).toBeNull();
  });

  it("returns null without a tenant to file the token under", () => {
    expect(platformPushRegistration({ ...PLATFORM_MERCHANT, tenantId: null })).toBeNull();
  });
});

describe("platformPushCleanup", () => {
  const SUPER_IN_PLATFORM_STORE = {
    isAuthenticated: true,
    userId: "user-super",
    convexUrl: null,
    orderBackend: "platform" as const,
    tenantId: "tenant-1",
    isSuperadmin: true,
    impersonatedTenantId: "tenant-1",
  };

  it("removes the superadmin's own tokens from the viewed platform tenant", () => {
    expect(platformPushCleanup(SUPER_IN_PLATFORM_STORE)).toEqual({
      tenantId: "tenant-1",
      userId: "user-super",
    });
  });

  it("does nothing for a merchant in their own store", () => {
    expect(platformPushCleanup(PLATFORM_MERCHANT)).toBeNull();
  });

  it("does nothing when the viewed store is on Convex — the Convex cleanup owns that", () => {
    expect(
      platformPushCleanup({
        ...SUPER_IN_PLATFORM_STORE,
        orderBackend: "convex",
        convexUrl: "https://coffee.convex.cloud",
      })
    ).toBeNull();
  });
});

describe("root layout push wiring", () => {
  const layout = readFileSync(join(__dirname, "..", "app", "_layout.tsx"), "utf8");

  it("registers platform tokens into public.push_tokens with the dedupe key", () => {
    expect(layout).toMatch(/platformPushRegistration/);
    expect(layout).toMatch(/from\("push_tokens"\)/);
    expect(layout).toMatch(/onConflict: "tenant_id,token"/);
  });

  it("cleans a leaked superadmin token out of a viewed platform store", () => {
    expect(layout).toMatch(/platformPushCleanup/);
  });
});
