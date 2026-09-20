import { readFileSync } from "fs";
import { join } from "path";

import { isBusinessTabVisible } from "./portfolio-landing";
import type { BranchScope } from "./branch-scope";

/**
 * A branch manager must not be offered the branch screens.
 *
 * `isPortfolioAvailable` says the screens are only for an account that runs
 * several branches. A branch manager is `role='admin'` with full permissions
 * by construction, so the permission gate alone says yes to every branch's
 * name and takings, side by side. This gate is the one that says no, and it
 * has to be asked by every surface that can show a Business tab — the bar,
 * both hubs, Home's Branches card — through the one shared rule.
 */

const ALL: BranchScope = { kind: "all" };
const NORTH: BranchScope = { kind: "branch", outletId: "outlet-north" };

describe("isBusinessTabVisible", () => {
  it("registers the Business tabs for a qualifying owner", () => {
    expect(isBusinessTabVisible("portfolio", { accountScope: ALL, activeOutletCount: 2 })).toBe(true);
    expect(isBusinessTabVisible("branches", { accountScope: ALL, activeOutletCount: 2 })).toBe(true);
    expect(isBusinessTabVisible("branch-menu", { accountScope: ALL, activeOutletCount: 2 })).toBe(true);
  });

  it("withholds them from a branch manager", () => {
    expect(isBusinessTabVisible("portfolio", { accountScope: NORTH, activeOutletCount: 3 })).toBe(false);
    expect(isBusinessTabVisible("branches", { accountScope: NORTH, activeOutletCount: 3 })).toBe(false);
  });

  it("withholds them from a single-location store and the demo", () => {
    expect(isBusinessTabVisible("portfolio", { accountScope: ALL, activeOutletCount: 1 })).toBe(false);
    expect(
      isBusinessTabVisible("portfolio", { accountScope: ALL, activeOutletCount: 3, isDemo: true }),
    ).toBe(false);
  });

  it("leaves every non-Business tab alone", () => {
    // This gate owns exactly one section. Anything else it touched would be a
    // tab disappearing for a merchant who never asked for branches.
    for (const tab of ["dashboard", "orders", "pos", "analytics", "inventory"]) {
      expect(isBusinessTabVisible(tab, { accountScope: NORTH, activeOutletCount: 3 })).toBe(true);
    }
  });
});

/**
 * Source guardrails. The rule above is only worth having if the surfaces that
 * can show a Business screen actually ask it. Jest here runs pure-logic roots
 * only, so these assert on the sources.
 */
describe("merchant app wiring", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");

  it("gates every tab in the tab bar through the shared rule", () => {
    // The bar asks one shared rule (lib/tab-visibility.ts), and that rule is
    // the one that asks the branch-count gate — so the gate cannot be dropped
    // from the bar without also dropping it from the hubs.
    expect(read("app", "(main)", "_layout.tsx")).toMatch(/isTabOnBar/);
    expect(read("lib", "tab-visibility.ts")).toMatch(/isBusinessTabVisible/);
  });

  it("lists hub rows through the shared rule", () => {
    expect(read("lib", "hubs.ts")).toMatch(/isTabReachable/);
    expect(read("app", "(main)", "menu.tsx")).toMatch(/hubSections\(MANAGE_SECTIONS/);
    expect(read("app", "(main)", "reports.tsx")).toMatch(/hubSections\(REPORTS_SECTIONS/);
  });

  it("shows Home's Branches card through the same predicate", () => {
    expect(read("app", "(main)", "dashboard.tsx")).toMatch(/isPortfolioAvailable\(/);
  });
});
