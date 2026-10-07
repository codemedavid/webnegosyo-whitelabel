import {
  isSentryEnabled,
  sentryEnvironment,
  sentryScopeFromAuth,
  NO_VALUE_TAG,
  scrubBreadcrumb,
  scrubEvent,
} from "./sentry-config";

const SIGNED_OUT = {
  userId: null,
  tenantId: null,
  tenantSlug: null,
  outletId: null,
  role: null,
  orderBackend: null,
  isDemo: false,
  isSuperadmin: false,
  impersonatedTenantId: null,
};

describe("isSentryEnabled", () => {
  it("sends from release builds that carry a DSN", () => {
    expect(isSentryEnabled({ dsn: "https://k@o1.ingest.sentry.io/1", isDev: false, forceEnable: false })).toBe(true);
  });

  it("stays silent in development so Metro reloads never reach the dashboard", () => {
    expect(isSentryEnabled({ dsn: "https://k@o1.ingest.sentry.io/1", isDev: true, forceEnable: false })).toBe(false);
  });

  it("lets a developer opt back in while debugging Sentry itself", () => {
    expect(isSentryEnabled({ dsn: "https://k@o1.ingest.sentry.io/1", isDev: true, forceEnable: true })).toBe(true);
  });

  it("is off without a DSN, even when forced", () => {
    expect(isSentryEnabled({ dsn: "", isDev: false, forceEnable: true })).toBe(false);
    expect(isSentryEnabled({ dsn: "   ", isDev: false, forceEnable: false })).toBe(false);
  });
});

describe("sentryEnvironment", () => {
  it("uses the EAS update channel so preview and production builds separate", () => {
    expect(sentryEnvironment({ isDev: false, channel: "preview" })).toBe("preview");
  });

  it("falls back to development/production when the build has no channel", () => {
    expect(sentryEnvironment({ isDev: true, channel: null })).toBe("development");
    expect(sentryEnvironment({ isDev: false, channel: "" })).toBe("production");
  });
});

describe("sentryScopeFromAuth", () => {
  it("identifies the account by id only — never email or phone", () => {
    const scope = sentryScopeFromAuth({
      ...SIGNED_OUT,
      userId: "u-1",
      tenantId: "t-1",
      tenantSlug: "seacook",
      outletId: "o-1",
      role: "admin",
      orderBackend: "platform",
    });

    expect(scope.user).toEqual({ id: "u-1" });
    expect(scope.tags).toEqual({
      tenant_id: "t-1",
      tenant_slug: "seacook",
      outlet_id: "o-1",
      role: "admin",
      order_backend: "platform",
      demo: "false",
      superadmin: "false",
      impersonated_tenant_id: NO_VALUE_TAG,
    });
  });

  it("overwrites every tag on sign-out so the next account's errors are not mislabelled", () => {
    const scope = sentryScopeFromAuth(SIGNED_OUT);

    expect(scope.user).toBeNull();
    expect(Object.values(scope.tags).every((v) => v === NO_VALUE_TAG || v === "false")).toBe(true);
    expect(Object.keys(scope.tags)).toHaveLength(8);
  });

  it("marks demo and impersonated sessions so they can be filtered out", () => {
    const scope = sentryScopeFromAuth({
      ...SIGNED_OUT,
      userId: "sa-1",
      isDemo: true,
      isSuperadmin: true,
      impersonatedTenantId: "t-9",
    });

    expect(scope.tags.demo).toBe("true");
    expect(scope.tags.superadmin).toBe("true");
    expect(scope.tags.impersonated_tenant_id).toBe("t-9");
  });
});

describe("scrubBreadcrumb", () => {
  it("drops the query string from request breadcrumbs, where PostgREST filters carry phone numbers", () => {
    const crumb = scrubBreadcrumb({
      category: "xhr",
      data: {
        url: "https://x.supabase.co/rest/v1/customers?select=id&phone_e164=eq.%2B639171234567",
        method: "GET",
        status_code: 200,
      },
    });

    expect(crumb.data?.url).toBe("https://x.supabase.co/rest/v1/customers");
    expect(crumb.data?.method).toBe("GET");
  });

  it("also cleans fetch breadcrumbs and URL fragments", () => {
    const crumb = scrubBreadcrumb({ category: "fetch", data: { url: "https://a.b/c#access_token=secret" } });

    expect(crumb.data?.url).toBe("https://a.b/c");
  });

  it("redacts emails and phone numbers quoted in console breadcrumbs", () => {
    const crumb = scrubBreadcrumb({
      category: "console",
      message: "lookup failed for juan@example.com / +63 917 123 4567 / 09171234567",
    });

    expect(crumb.message).not.toMatch(/juan@example\.com|917|0917/);
  });

  it("leaves ids and plain messages alone", () => {
    const crumb = scrubBreadcrumb({ category: "console", message: "order 3f1c2a9e-0000-4000-8000-000000000001 synced" });

    expect(crumb.message).toBe("order 3f1c2a9e-0000-4000-8000-000000000001 synced");
  });

  it("does not modify the breadcrumb it was given", () => {
    const original = { category: "xhr", data: { url: "https://a.b/c?x=1" } };

    scrubBreadcrumb(original);

    expect(original.data.url).toBe("https://a.b/c?x=1");
  });
});

describe("scrubEvent", () => {
  it("masks contacts quoted in exception texts and the message", () => {
    const event = scrubEvent({
      message: "failed for ana@example.com",
      exception: { values: [{ value: 'duplicate key: Key (phone_e164)=(+639171234567) already exists' }] },
    });

    expect(event.message).toBe("failed for [email]");
    expect(event.exception?.values?.[0].value).not.toContain("9171234567");
  });
});
