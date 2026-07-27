import { resolveOrderBackend, isPlatformBackend } from "./order-backend";

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

  it("is false for a tenant on its own dedicated Supabase project", () => {
    // `supabase` means a per-tenant project, which the app reaches with
    // different credentials than the shared platform database.
    expect(
      isPlatformBackend({
        order_backend: "supabase",
        convex_deployment_url: null,
      })
    ).toBe(false);
  });
});
