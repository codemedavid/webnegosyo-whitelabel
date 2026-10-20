/**
 * Guardrails for the Texts screens (automatic SMS automations).
 *
 * Like the other mount guardrails, this reads the screen sources rather than
 * rendering them; the rendered behaviour is in components/texts/TextsScreen.test.tsx.
 * What it holds is the wiring: the route exists and is registered, the door is
 * gated exactly like the server (guest-list grant, store-wide accounts only),
 * and the screens speak through the shared words module.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { getWorkspace, workspaceForTab } from "../workspaces";
import { isTabAllowed } from "../staff-permissions";
import { isTabReachable, REPORTS_DOORS, SUBSCREEN_TABS, type TabVisibilityContext } from "../tab-visibility";
import { parentOf } from "../subscreen-links";
import { tabPresentation } from "../workspace-presentation";

const ROOT = join(__dirname, "..", "..");

function readCode(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const owner: TabVisibilityContext = {
  caller: { role: "admin", isOwner: true, permissions: null },
  audience: { accountScope: { kind: "all" }, activeOutletCount: 1, isDemo: false },
  takesAdvanceOrders: false,
};

describe("texts route registration", () => {
  it("has a hub route and an editor route", () => {
    expect(existsSync(join(ROOT, "app", "(main)", "texts.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "app", "(main)", "automation", "[recipe].tsx"))).toBe(true);
  });

  it("hangs under Reports, in the Insights section", () => {
    expect(workspaceForTab("texts")).toBe("insights");
    expect(getWorkspace("insights").tabs).toContain("texts");
    expect(SUBSCREEN_TABS).toContain("texts");
    expect(REPORTS_DOORS).toContain("texts");
    expect(parentOf("texts")).toBe("reports");
    expect(tabPresentation("texts").label).toBe("Texts");
  });

  it("is registered in the tab layout, the editor as a hidden route", () => {
    const layout = readCode("app", "(main)", "_layout.tsx");
    expect(layout).toMatch(/name="texts" options=\{\{ href: show\("texts"\)/);
    expect(layout).toMatch(/name="automation\/\[recipe\]" options=\{\{ href: null/);
  });
});

describe("texts permissions — the same gate as the server", () => {
  it("needs the guest-list grant", () => {
    expect(isTabAllowed({ role: "admin", isOwner: false, permissions: ["pos"] }, "texts")).toBe(false);
    expect(isTabAllowed({ role: "admin", isOwner: false, permissions: ["analytics"] }, "texts")).toBe(false);
    expect(isTabAllowed({ role: "admin", isOwner: false, permissions: ["customers"] }, "texts")).toBe(true);
    expect(isTabAllowed({ role: "admin", isOwner: true, permissions: null }, "texts")).toBe(true);
  });

  it("is open to the owner and to customers staff of the whole store", () => {
    expect(isTabReachable("texts", owner)).toBe(true);
    const staff = { ...owner, caller: { role: "admin", isOwner: false, permissions: ["customers"] } };
    expect(isTabReachable("texts", staff)).toBe(true);
  });

  it("is closed to a branch-confined account, whatever its grants", () => {
    const branch = { ...owner, audience: { ...owner.audience, accountScope: { kind: "branch" as const, outletId: "o1" } } };
    expect(isTabReachable("texts", branch)).toBe(false);
    // The guest list itself stays: only the store-wide texting screen is withheld.
    expect(isTabReachable("customers", branch)).toBe(true);
  });
});

describe("texts screen wiring", () => {
  const hub = readCode("app", "(main)", "texts.tsx");
  const editor = readCode("app", "(main)", "automation", "[recipe].tsx");

  it("gates both screens on the shared visibility rule", () => {
    expect(hub).toMatch(/isTabReachable\("texts"/);
    expect(editor).toMatch(/isTabReachable\("texts"/);
  });

  it("reads through the cached automations hook and refetches on focus", () => {
    expect(hub).toMatch(/useAutomationsView/);
    expect(hub).toMatch(/useRefetchOnScreenFocus/);
    expect(editor).toMatch(/useAutomationsView/);
  });

  it("rebuilds the editor draft on every visit (the tab never unmounts)", () => {
    expect(editor).toMatch(/useFocusEffect/);
  });

  it("guards writes for read-only demo stores", () => {
    expect(editor).toMatch(/isBlockedByDemo/);
    expect(readCode("components", "texts", "use-automation-switch.ts")).toMatch(/DEMO_READONLY_MESSAGE/);
    expect(readCode("components", "texts", "RulesPanel.tsx")).toMatch(/isBlockedByDemo/);
  });

  it("never offers the opt-out line — STOP replies are not handled yet", () => {
    expect(readCode("components", "texts", "RulesPanel.tsx")).not.toMatch(/update\(\{\s*optOutLine|opt-out|Reply STOP/i);
  });

  it("keeps the sending phone card on Rewards too", () => {
    expect(readCode("app", "(main)", "loyalty.tsx")).toMatch(/LoyaltySmsDeviceCard/);
    expect(readCode("components", "texts", "RulesPanel.tsx")).toMatch(/<LoyaltySmsDeviceCard/);
  });
});
