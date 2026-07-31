/**
 * The merchant app's half of the subscription gate.
 *
 * `resolveSession` is already the one place both the cold-start path and the
 * interactive sign-in agree on what a session means, so the pause belongs here
 * rather than in either screen. Two entry points deciding separately who is
 * paid up is exactly the drift this module exists to prevent.
 *
 * The projection guardrails at the bottom are the highest-risk part of the
 * whole feature. Twice before in this codebase a column existed, the code read
 * it, and the SELECT never asked for it — the branding mobile overrides and the
 * storefront tenant read. Both times the feature was silently dead in
 * production while every unit test passed. A gate that fails that way fails
 * OPEN, so nothing is ever collected and nobody finds out.
 */
import { readFileSync } from "fs";
import { join } from "path";

import {
  PAUSED_LANDING_HREF,
  SUBSCRIPTION_SELECT,
  needsSubscriptionLookup,
  resolveSession,
} from "./session-resolve";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const NOW = "2026-08-10T07:00:00.000Z";

const ADMIN_ROW = {
  tenant_id: "tenant-1",
  role: "admin",
  is_owner: true,
  permissions: null,
};

const TENANT_ROW = {
  id: "tenant-1",
  slug: "coffee",
  name: "Webnegosyo Coffee",
  convex_deployment_url: "https://example.convex.cloud",
};

const PAID = { status: "active", paid_through: "2026-08-31", grace_days: 3 };
const LAPSED = { status: "past_due", paid_through: "2026-07-31", grace_days: 3 };
const IN_GRACE = { status: "past_due", paid_through: "2026-08-09", grace_days: 3 };

describe("needsSubscriptionLookup", () => {
  it("skips the lookup for a superadmin, who holds no tenant", () => {
    expect(
      needsSubscriptionLookup({ tenant_id: null, role: "superadmin", is_owner: false, permissions: null })
    ).toBe(false);
  });

  it("requires the lookup for a merchant", () => {
    expect(needsSubscriptionLookup(ADMIN_ROW)).toBe(true);
  });
});

describe("resolveSession subscription gate", () => {
  it("signs a paid merchant in as normal", () => {
    const result = resolveSession("user-1", ADMIN_ROW, TENANT_ROW, null, {
      subscription: PAID,
      nowIso: NOW,
    });

    expect(result.mode).toBe("merchant");
  });

  it("signs a merchant inside the grace window in as normal", () => {
    // Grace exists so a late transfer does not lock a shop out mid-service.
    const result = resolveSession("user-1", ADMIN_ROW, TENANT_ROW, null, {
      subscription: IN_GRACE,
      nowIso: NOW,
    });

    expect(result.mode).toBe("merchant");
  });

  it("pauses a merchant past due and past grace", () => {
    const result = resolveSession("user-1", ADMIN_ROW, TENANT_ROW, null, {
      subscription: LAPSED,
      nowIso: NOW,
    });

    expect(result.mode).toBe("paused");
    expect(result.landingHref).toBe(PAUSED_LANDING_HREF);
  });

  it("keeps the session authenticated when paused", () => {
    // The paused screen has to name the store and say what is owed. Denying
    // the session outright would drop them at the login form with no
    // explanation, and they would just try their password again.
    const result = resolveSession("user-1", ADMIN_ROW, TENANT_ROW, null, {
      subscription: LAPSED,
      nowIso: NOW,
    });

    expect(result.auth).toMatchObject({
      isAuthenticated: true,
      tenantName: "Webnegosyo Coffee",
      tenantId: "tenant-1",
    });
  });

  it("reports how overdue the account is, so the screen can say so", () => {
    const result = resolveSession("user-1", ADMIN_ROW, TENANT_ROW, null, {
      subscription: LAPSED,
      nowIso: NOW,
    });

    expect(result.subscription).toMatchObject({ daysOverdue: 10, paidThroughDayKey: "2026-07-31" });
  });

  it("never pauses a superadmin", () => {
    // The superadmin is the only person who can FIX an unpaid account. Locking
    // them out of the tool they collect with would be self-defeating.
    const result = resolveSession(
      "user-1",
      { tenant_id: null, role: "superadmin", is_owner: false, permissions: null },
      null,
      null,
      { subscription: LAPSED, nowIso: NOW }
    );

    expect(result.mode).toBe("superadmin");
  });

  it("signs a merchant in when the subscription lookup returned nothing", () => {
    // A failed network call, a tenant that predates billing, an RLS change —
    // every one of those must let the merchant work. Reading absence as
    // non-payment would black out every store the first time the query blipped.
    const result = resolveSession("user-1", ADMIN_ROW, TENANT_ROW, null, {
      subscription: null,
      nowIso: NOW,
    });

    expect(result.mode).toBe("merchant");
  });

  it("signs a merchant in when no subscription context is passed at all", () => {
    // Any caller not yet taught about billing keeps working exactly as before.
    const result = resolveSession("user-1", ADMIN_ROW, TENANT_ROW);

    expect(result.mode).toBe("merchant");
  });

  it("still denies a non-admin before the subscription is even considered", () => {
    const result = resolveSession(
      "user-1",
      { ...ADMIN_ROW, role: "customer" },
      TENANT_ROW,
      null,
      { subscription: PAID, nowIso: NOW }
    );

    expect(result.mode).toBe("denied");
  });
});

describe("subscription projection guardrails", () => {
  const columns = ["status", "paid_through", "grace_days"];

  it("selects every column the gate reads", () => {
    // If this list and the resolver ever disagree, the missing column arrives
    // as undefined and the gate silently opens for everyone.
    for (const column of columns) {
      expect(SUBSCRIPTION_SELECT).toContain(column);
    }
  });

  it("reads the subscription on the interactive sign-in path", () => {
    const source = read("app", "(auth)", "login.tsx");

    expect(source).toContain("SUBSCRIPTION_SELECT");
    expect(source).toContain("tenant_subscriptions");
  });

  it("reads the subscription on the cold-start path", () => {
    // A merchant who lapses while already signed in must be caught on the next
    // app launch, not only if they happen to sign out and back in.
    const source = read("app", "_layout.tsx");

    expect(source).toContain("SUBSCRIPTION_SELECT");
    expect(source).toContain("tenant_subscriptions");
  });

  it("routes both entry points through the shared landing href", () => {
    for (const file of [join("app", "(auth)", "login.tsx"), join("app", "_layout.tsx")]) {
      expect(read(file)).toContain("landingHref");
    }
  });
});
