import { readFileSync } from "fs";
import { join } from "path";

import {
  visibleWorkspaces,
  activeWorkspace,
  isBusinessTabVisible,
} from "./portfolio-landing";
import type { BranchScope } from "./branch-scope";
import type { StaffPermissionHolder } from "./staff-permissions";

/**
 * A branch manager must not be offered the Business view.
 *
 * `isPortfolioAvailable` already says the view is only for an account that
 * runs several branches, and the landing redirect respects it — but nothing
 * else did. The view switcher listed Business from `allowedWorkspaces`, which
 * asks only about permissions, and a branch manager is `role='admin'` with
 * full permissions by construction. So a manager could open the sheet, tap
 * Business, and read the portfolio and the branch comparison: every branch's
 * name and takings, side by side.
 *
 * The predicate that decides the landing view must therefore also decide what
 * the switcher offers and which tabs the bar registers, or one of the three
 * disagrees and becomes the leak.
 */

const ALL: BranchScope = { kind: "all" };
const NORTH: BranchScope = { kind: "branch", outletId: "outlet-north" };

const OWNER: StaffPermissionHolder = { role: "admin", isOwner: true, permissions: null };
/** A branch manager: an ordinary admin, unrestricted, locked to one branch. */
const MANAGER: StaffPermissionHolder = { role: "admin", isOwner: false, permissions: null };

const keys = (user: StaffPermissionHolder, audience: Parameters<typeof visibleWorkspaces>[1]) =>
  visibleWorkspaces(user, audience).map((w) => w.key);

describe("visibleWorkspaces", () => {
  it("offers Business to a store-wide account running several branches", () => {
    expect(keys(OWNER, { accountScope: ALL, activeOutletCount: 3 })).toContain("business");
  });

  it("withholds Business from a branch manager", () => {
    // The bug. Permissions said yes; the branch lock has to say no.
    expect(keys(MANAGER, { accountScope: NORTH, activeOutletCount: 3 })).not.toContain(
      "business",
    );
  });

  it("still offers a branch manager the four working views", () => {
    // A manager runs a shift. Nothing about the branch lock touches Operations,
    // Register, Insights, or Products.
    expect(keys(MANAGER, { accountScope: NORTH, activeOutletCount: 3 })).toEqual([
      "operations",
      "register",
      "insights",
      "products",
    ]);
  });

  it("withholds Business from a single-location store", () => {
    expect(keys(OWNER, { accountScope: ALL, activeOutletCount: 1 })).not.toContain("business");
  });

  it("withholds Business from the demo tour", () => {
    expect(
      keys(OWNER, { accountScope: ALL, activeOutletCount: 3, isDemo: true }),
    ).not.toContain("business");
  });

  it("withholds Business until the branch count is known", () => {
    // Matches the landing rule: an unknown count reads as single-location, so
    // the view never flashes into the switcher and out again.
    expect(keys(OWNER, { accountScope: ALL, activeOutletCount: null })).not.toContain(
      "business",
    );
  });

  it("keeps honouring staff permissions", () => {
    // Composition, not replacement. A cashier with only the POS grant sees
    // Register plus Operations — the dashboard is ungated for every staff
    // member — and, branches or no branches, never Business.
    const cashier: StaffPermissionHolder = {
      role: "admin",
      isOwner: false,
      permissions: ["pos"],
    };

    expect(keys(cashier, { accountScope: ALL, activeOutletCount: 3 })).toEqual([
      "operations",
      "register",
    ]);
  });
});

describe("isBusinessTabVisible", () => {
  it("registers the Business tabs for a qualifying owner", () => {
    expect(
      isBusinessTabVisible("portfolio", { accountScope: ALL, activeOutletCount: 2 }),
    ).toBe(true);
    expect(
      isBusinessTabVisible("branches", { accountScope: ALL, activeOutletCount: 2 }),
    ).toBe(true);
  });

  it("withholds them from a branch manager", () => {
    // The tab bar is a second door into the same screens: a registered tab is
    // reachable even when the switcher never named its view.
    expect(
      isBusinessTabVisible("portfolio", { accountScope: NORTH, activeOutletCount: 3 }),
    ).toBe(false);
    expect(
      isBusinessTabVisible("branches", { accountScope: NORTH, activeOutletCount: 3 }),
    ).toBe(false);
  });

  it("leaves every non-Business tab alone", () => {
    // This gate owns exactly one view. Anything else it touched would be a tab
    // disappearing for a merchant who never asked for branches.
    for (const tab of ["dashboard", "orders", "pos", "analytics", "inventory"]) {
      expect(isBusinessTabVisible(tab, { accountScope: NORTH, activeOutletCount: 3 })).toBe(
        true,
      );
    }
  });
});

describe("activeWorkspace", () => {
  it("keeps a view the account may see", () => {
    expect(activeWorkspace("insights", OWNER, { accountScope: ALL, activeOutletCount: 3 })).toBe(
      "insights",
    );
  });

  it("falls back to Operations when the stored view is gone", () => {
    // The active view is persisted. An owner who drilled into Business and
    // then handed the device to a branch manager — or a manager whose store
    // dropped to one branch — must not land on a view with no tabs, which
    // renders as an empty tab bar rather than as a restriction.
    expect(
      activeWorkspace("business", MANAGER, { accountScope: NORTH, activeOutletCount: 3 }),
    ).toBe("operations");
  });

  it("falls back to a view the account actually has, not a fixed one", () => {
    // Operations survives every permission set today (the dashboard is
    // ungated), so the fallback reads as "the first visible view" rather than
    // as a hardcoded route — the distinction that keeps this correct if the
    // dashboard ever becomes gated.
    const cashier: StaffPermissionHolder = {
      role: "admin",
      isOwner: false,
      permissions: ["pos"],
    };
    const audience = { accountScope: ALL, activeOutletCount: 3 };

    expect(activeWorkspace("business", cashier, audience)).toBe(
      visibleWorkspaces(cashier, audience)[0].key,
    );
  });
});

/**
 * Source guardrails. The rules above are only worth having if the two surfaces
 * that can show a Business tab actually ask them — the switcher sheet and the
 * tab bar. Jest here runs pure-logic roots only, so these assert on the screen
 * sources, the same way `business-screen-mount.test.ts` does.
 */
describe("merchant app wiring", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");

  it("lists views from the branch-aware rule in the switcher", () => {
    const source = read("components", "WorkspaceSwitcher.tsx");
    expect(source).toMatch(/visibleWorkspaces/);
    // allowedWorkspaces alone is the bug: it asks only about permissions.
    expect(source).not.toMatch(/\ballowedWorkspaces\b/);
  });

  it("gates the Business tabs in the tab bar", () => {
    expect(read("app", "(main)", "_layout.tsx")).toMatch(/isBusinessTabVisible/);
  });
});
