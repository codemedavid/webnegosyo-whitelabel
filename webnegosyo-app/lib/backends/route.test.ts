import { resolveRefRoute, type RefRouteInput } from "./route";

/**
 * `lib/hooks.ts` must decide, per function ref, whether to serve it from Convex
 * or the platform Supabase adapter. The decision is extracted here so it is
 * provable without rendering a React tree — the hook file itself is exercised
 * manually via Expo.
 */

function input(overrides: Partial<RefRouteInput> = {}): RefRouteInput {
  return {
    orderBackend: "platform",
    convexUrl: null,
    tenantId: "tenant-1",
    ref: "orders:getOrders",
    ...overrides,
  };
}

describe("resolveRefRoute", () => {
  it("routes a platform tenant's order refs to the Supabase adapter", () => {
    // Act
    const route = resolveRefRoute(input());

    // Assert
    expect(route).toBe("platform");
  });

  it("leaves every Convex tenant on Convex", () => {
    // Arrange: the overwhelming majority of live tenants. Any drift here is a
    // regression for stores that work today.
    const route = resolveRefRoute(
      input({ orderBackend: "convex", convexUrl: "https://x.convex.cloud" })
    );

    // Assert
    expect(route).toBe("convex");
  });

  it("keeps a Convex tenant on Convex even for a ref the adapter could serve", () => {
    // Act
    const route = resolveRefRoute(
      input({
        orderBackend: "convex",
        convexUrl: "https://x.convex.cloud",
        ref: "orders:getDashboardStats",
      })
    );

    // Assert
    expect(route).toBe("convex");
  });

  it("reports a platform ref the adapter cannot serve as unsupported", () => {
    // Arrange: analytics has no platform implementation yet. Reporting it as
    // unsupported makes the screen show its "needs a backend update"
    // placeholder instead of an empty chart that looks like real zero data.
    const route = resolveRefRoute(input({ ref: "analytics:getUpsellAnalytics" }));

    // Assert
    expect(route).toBe("unsupported");
  });

  it("does not query without a tenant, even on the platform backend", () => {
    // Arrange: a superadmin who has not entered a store. Their RLS policy
    // grants every tenant's rows.
    const route = resolveRefRoute(input({ tenantId: null }));

    // Assert
    expect(route).toBe("idle");
  });

  it("treats a tenant on its own Supabase project as not-yet-served", () => {
    // Arrange: `order_backend = 'supabase'` is the separate per-tenant-project
    // track. This adapter targets the SHARED platform database only, and must
    // not silently read the wrong database.
    const route = resolveRefRoute(input({ orderBackend: "supabase" }));

    // Assert
    expect(route).toBe("unsupported");
  });

  it("falls back to Convex when the backend has not been resolved yet", () => {
    // Arrange: the session patch has not landed. Convex is the historical
    // default and its own hook already handles a null url by skipping.
    const route = resolveRefRoute(input({ orderBackend: null }));

    // Assert
    expect(route).toBe("convex");
  });
});
