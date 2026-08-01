/**
 * The merchant app does NOT gate on billing.
 *
 * The subscription pause lives on the web admin only. The app once carried its
 * own copy of that gate — a `paused` session mode, a subscription SELECT on
 * both entry points, and a redirect to a dead-end screen — and it was removed
 * deliberately.
 *
 * This file is the guardrail for that decision. Without it the gate is the kind
 * of thing that gets reinstated by a well-meaning "the app should match the
 * web" change, and the failure mode is severe: a merchant standing at a
 * register mid-service, locked out of taking orders by a billing query. The web
 * admin is where an owner goes to deal with money; the app is where their staff
 * work a shift.
 *
 * The assertions are deliberately source-reading. A behavioural test would only
 * prove `resolveSession` does not pause — it could not catch a screen that
 * re-reads `tenant_subscriptions` for itself.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import * as sessionResolve from "./session-resolve";
import { resolveSession } from "./session-resolve";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

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

describe("merchant app session has no billing gate", () => {
  it("signs a merchant in without consulting any subscription", () => {
    const result = resolveSession("user-1", ADMIN_ROW, TENANT_ROW, null);

    expect(result.mode).toBe("merchant");
    expect(result.landingHref).toBe(sessionResolve.MERCHANT_LANDING_HREF);
  });

  it("exposes no paused landing route to redirect to", () => {
    expect(sessionResolve).not.toHaveProperty("PAUSED_LANDING_HREF");
  });

  it("exposes no subscription projection for an entry point to read", () => {
    // The SELECT constant existing at all is the seam the gate grew from.
    expect(sessionResolve).not.toHaveProperty("SUBSCRIPTION_SELECT");
    expect(sessionResolve).not.toHaveProperty("needsSubscriptionLookup");
  });

  it("puts nothing on the session for a screen to gate on", () => {
    const result = resolveSession("user-1", ADMIN_ROW, TENANT_ROW, null);

    expect(result.auth).not.toHaveProperty("isSubscriptionPaused");
  });
});

describe("no entry point reads the billing tables", () => {
  const ENTRY_POINTS: readonly string[][] = [
    ["app", "_layout.tsx"],
    ["app", "(auth)", "login.tsx"],
    ["lib", "session-resolve.ts"],
  ];

  it.each(ENTRY_POINTS)("does not query tenant_subscriptions in %s/%s", (...segments) => {
    expect(read(...segments)).not.toContain("tenant_subscriptions");
  });

  it("keeps the auth store free of a paused flag", () => {
    expect(read("stores", "auth-store.ts")).not.toContain("isSubscriptionPaused");
  });

  it("ships no paused screen", () => {
    // A screen with no route into it is worse than no screen: it reads as a
    // supported state to the next person who finds it.
    expect(existsSync(join(ROOT, "app", "(main)", "subscription-paused.tsx"))).toBe(false);
  });

  it("keeps the ported billing resolver out of the app entirely", () => {
    expect(existsSync(join(ROOT, "lib", "subscription-access.ts"))).toBe(false);
  });
});
