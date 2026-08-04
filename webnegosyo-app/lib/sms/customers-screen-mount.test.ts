/**
 * Guardrails for the merchant app's Customers / SMS follow-up screen.
 *
 * Jest here only runs pure-logic roots, so — like the other mount guardrails in
 * this directory — this asserts on the screen source rather than rendering it.
 * What it locks down is the wiring a unit test of the pure modules cannot see:
 * that the tab exists and is gated, that it is Android-only, and that a
 * branch-scoped account cannot blast the whole store's guests.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { getWorkspace, workspaceForTab } from "../workspaces";
import { isTabAllowed } from "../staff-permissions";

const ROOT = join(__dirname, "..", "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

function readCode(...segments: string[]): string {
  return read(...segments)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("customers tab registration", () => {
  it("has a route file, so registering it cannot break the tab bar", () => {
    expect(existsSync(join(ROOT, "app", "(main)", "customers.tsx"))).toBe(true);
  });

  it("belongs to the Insights view, beside growth", () => {
    expect(workspaceForTab("customers")).toBe("insights");
    expect(getWorkspace("insights").tabs).toContain("customers");
  });

  it("is registered in the tab layout", () => {
    const layout = read("app", "(main)", "_layout.tsx");

    expect(layout).toContain('name="customers"');
    expect(layout).toContain('show("customers")');
  });
});

describe("customers tab permissions", () => {
  const cashier = { role: "admin", isOwner: false, permissions: ["pos"] };
  const owner = { role: "admin", isOwner: true, permissions: null };

  it("is closed to a cashier who only holds the register grant", () => {
    // An unmapped tab defaults to ALLOWED, which would hand every guest's
    // phone number to whoever can ring up a sale.
    expect(isTabAllowed(cashier, "customers")).toBe(false);
  });

  it("is open to the owner", () => {
    expect(isTabAllowed(owner, "customers")).toBe(true);
  });

  it("is open to staff explicitly granted the customers permission", () => {
    expect(
      isTabAllowed({ role: "admin", isOwner: false, permissions: ["customers"] }, "customers")
    ).toBe(true);
  });
});

describe("customers screen wiring", () => {
  it("gates the SMS surface on the shared availability predicate", () => {
    // iOS has no send path at all; showing the campaign UI there would be a
    // dead end, and an SMS surface is a liability in App Store review.
    const source = readCode("app", "(main)", "customers.tsx");

    expect(source).toMatch(/isSmsCampaignsAvailable/);
  });

  it("defers to the shared sms modules instead of querying Supabase beside the JSX", () => {
    const source = readCode("app", "(main)", "customers.tsx");

    expect(source).toMatch(/from "\.\.\/\.\.\/lib\/sms\//);
  });

  it("reloads when the screen comes back into focus", () => {
    // This tab never unmounts. A mount-only `useEffect` meant a campaign saved
    // in the editor did not appear until the app was force-quit from the
    // background, which reads exactly like the save silently failed.
    const source = readCode("app", "(main)", "customers.tsx");

    expect(source).toMatch(/useFocusEffect/);
  });

  it("offers to record a guest's consent from the row", () => {
    // Consent only accrued at online checkout, so the audience never left zero
    // for a merchant whose guests order over the counter.
    const source = readCode("app", "(main)", "customers.tsx");

    expect(source).toMatch(/consentActionFor/);
    expect(source).toMatch(/setCustomerConsent/);
  });

  it("does not recompute reachability inline", () => {
    // The rules for who may be texted live in one place on purpose; a second
    // copy in the JSX is how a screen starts disagreeing with the send loop.
    const source = readCode("app", "(main)", "customers.tsx");

    expect(source).not.toMatch(/sms_consent\s*&&/);
  });
});

describe("the campaign surface is absent on iOS, not merely disabled", () => {
  // Apple does not permit an app to send SMS on its own. Shipping a campaign
  // surface that explains it cannot send is both a review liability and a dead
  // end for the merchant, so on iOS none of it is rendered at all.
  //
  // These read the screen source rather than rendering it — this jest project
  // only runs pure-logic roots. They prove the gate is wired, not that a
  // rendered iOS screen is bare; the predicate's own behaviour is covered in
  // availability.test.ts.

  it("no longer offers the campaigns section on a platform that cannot send", () => {
    const source = readCode("app", "(main)", "customers.tsx");

    // The chip that switches into the campaign list must sit behind the gate.
    expect(source).toMatch(/canSendSms|isSmsCampaignsAvailable/);
    expect(source).not.toMatch(/Platform\.OS !== "android" && \(\s*<View style=\{styles\.notice\}/);
  });

  it("drops the notice that told an iOS merchant to use the Android app", () => {
    // With the surface gone there is nothing left to explain; the notice would
    // be advertising a feature the screen no longer shows.
    const source = read("app", "(main)", "customers.tsx");

    expect(source).not.toMatch(/send from the Android app|sends? from the Android app/i);
  });

  it("does not load campaigns on a platform that cannot send them", () => {
    // Loading them would be a wasted Supabase round trip on every focus, and
    // would light up the due-reminder scheduler for sends that cannot happen.
    const source = readCode("app", "(main)", "customers.tsx");

    expect(source).toMatch(/isSmsCampaignsAvailable\(Platform\.OS\)/);
  });

  it("refuses to open the campaign editor by deep link", () => {
    // Hiding the entry point is not enough: `campaign/[campaignId]` is a real
    // route, reachable from a notification tap or a restored navigation state.
    const source = readCode("app", "(main)", "campaign", "[campaignId].tsx");

    expect(source).toMatch(/isSmsCampaignsAvailable/);
  });
});

describe("the iOS binary declares nothing about SMS", () => {
  it("adds SEND_SMS through an Android-only config plugin", () => {
    // `withAndroidManifest` never runs on the iOS prebuild, so this is
    // structural rather than conditional — there is no iOS branch to get
    // wrong. Locked down because switching to `withPlugins`/`withInfoPlist`
    // here would silently put an SMS declaration in the iOS binary.
    const plugin = readCode("plugins", "withSmsPermissions.js");

    expect(plugin).toMatch(/withAndroidManifest/);
    expect(plugin).not.toMatch(/withInfoPlist|withEntitlementsPlist/);
  });

  it("asks for no SMS permission beyond sending", () => {
    const plugin = readCode("plugins", "withSmsPermissions.js");

    expect(plugin).toMatch(/android\.permission\.SEND_SMS/);
    expect(plugin).not.toMatch(/READ_SMS|RECEIVE_SMS/);
  });
});

describe("due campaign reminders", () => {
  it("has an adapter that turns the plan into real Android notifications", () => {
    // The pure planner is useless on its own — something has to hand it to
    // expo-notifications, or a campaign still comes due silently.
    expect(existsSync(join(ROOT, "lib", "sms", "due-alerts.ts"))).toBe(true);
  });

  it("syncs reminders from the screen that already computes due states", () => {
    const source = readCode("app", "(main)", "customers.tsx");

    expect(source).toMatch(/syncDueCampaignAlerts/);
  });

  it("does not ring campaign reminders on the new-order channel", () => {
    // The orders channel is MAX importance with a ringtone. A campaign
    // reminder that sounds like a live order is how the ringtone stops
    // meaning "a customer is waiting".
    const source = readCode("lib", "sms", "due-alerts.ts");

    expect(source).not.toMatch(/"orders"/);
  });
});
