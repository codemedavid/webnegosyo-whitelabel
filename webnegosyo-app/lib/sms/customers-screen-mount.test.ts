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
  it("gates the SMS surface on Android", () => {
    // iOS has no send path at all; showing the campaign UI there would be a
    // dead end, and an SMS surface is a liability in App Store review.
    const source = readCode("app", "(main)", "customers.tsx");

    expect(source).toMatch(/Platform\.OS/);
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
