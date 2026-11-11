import { resolveOrderBackend, isPlatformBackend, hasLiveOrderBackend } from "./order-backend";

describe("resolveOrderBackend", () => {
  it("uses the explicit order_backend column when it is set", () => {
    // Arrange
    const tenant = {
      order_backend: "platform" as const,
      convex_deployment_url: "https://example.convex.cloud",
    };

    // Act
    const backend = resolveOrderBackend(tenant);

    // Assert — the explicit column wins even though a Convex URL is present,
    // so a superadmin can migrate a tenant off Convex without clearing creds.
    expect(backend).toBe("platform");
  });

  it("falls back to convex when the column is absent but a Convex URL exists", () => {
    expect(
      resolveOrderBackend({ convex_deployment_url: "https://example.convex.cloud" })
    ).toBe("convex");
  });

  it("falls back to platform when neither the column nor a Convex URL is set", () => {
    expect(resolveOrderBackend({ convex_deployment_url: null })).toBe("platform");
  });

  it("ignores an unrecognized order_backend value and uses the legacy rule", () => {
    // A row written by a newer platform build must not strand the app on an
    // adapter it does not have; degrade to the historical behaviour instead.
    expect(
      resolveOrderBackend({
        order_backend: "warehouse" as never,
        convex_deployment_url: null,
      })
    ).toBe("platform");
  });

  it("treats a blank Convex URL as no Convex deployment", () => {
    expect(resolveOrderBackend({ convex_deployment_url: "   " })).toBe("platform");
  });

  it("derives a stale `supabase` pin (the retired own-project backend) like auto, as the web does", () => {
    const stale = "supabase" as never;
    expect(resolveOrderBackend({ order_backend: stale, convex_deployment_url: null })).toBe("platform");
    expect(
      resolveOrderBackend({ order_backend: stale, convex_deployment_url: "https://example.convex.cloud" })
    ).toBe("convex");
  });
});

describe("isPlatformBackend", () => {
  it("is true for a tenant with no Convex deployment", () => {
    expect(isPlatformBackend({ convex_deployment_url: null })).toBe(true);
  });

  it("is false for a Convex-backed tenant", () => {
    expect(
      isPlatformBackend({ convex_deployment_url: "https://example.convex.cloud" })
    ).toBe(false);
  });

  it("treats a stale `supabase` pin (the retired own-project backend) like auto", () => {
    // The column's CHECK still allows the word. Web and app must agree on
    // where such a store's orders are: derive from the Convex url.
    const stale = "supabase" as never;
    expect(isPlatformBackend({ order_backend: stale, convex_deployment_url: null })).toBe(true);
    expect(
      isPlatformBackend({ order_backend: stale, convex_deployment_url: "https://example.convex.cloud" })
    ).toBe(false);
  });
});

describe("hasLiveOrderBackend", () => {
  it("is true for a tenant with a Convex deployment", () => {
    expect(
      hasLiveOrderBackend({ convexUrl: "https://x.convex.cloud", orderBackend: "convex" })
    ).toBe(true);
  });

  it("is true for a platform-backed tenant even with no Convex url", () => {
    // The whole point of the platform backend: orders live in the shared
    // database this app is already authenticated against.
    expect(hasLiveOrderBackend({ convexUrl: null, orderBackend: "platform" })).toBe(true);
  });

  it("is false before the session has resolved a backend", () => {
    expect(hasLiveOrderBackend({ convexUrl: null, orderBackend: null })).toBe(false);
  });

  it("treats a blank Convex url as no backend", () => {
    expect(hasLiveOrderBackend({ convexUrl: "   ", orderBackend: null })).toBe(false);
  });
});
