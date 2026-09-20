import {
  isTabReachable,
  isTabOnBar,
  barTabs,
  reachableTabsOf,
  BAR_SLOTS,
  SUBSCREEN_TABS,
  REPORT_TABS,
  SETUP_TABS,
  HUB_TABS,
  MENU_TAB,
  REPORTS_TAB,
  type TabVisibilityContext,
} from "./tab-visibility";
import { subscreensOf } from "./subscreen-links";
import { WORKSPACES, getWorkspace } from "./workspaces";

const owner: TabVisibilityContext = {
  caller: { role: "admin", isOwner: true, permissions: null },
  audience: {
    accountScope: { kind: "all" },
    activeOutletCount: 3,
    isDemo: false,
  },
  takesAdvanceOrders: true,
  takesDineIn: true,
};

const posOnlyStaff: TabVisibilityContext = {
  ...owner,
  caller: { role: "admin", isOwner: false, permissions: ["pos"] },
};

const cook: TabVisibilityContext = {
  ...owner,
  caller: { role: "admin", isOwner: false, permissions: ["kitchen"] },
};

/**
 * A branch manager as they exist in the field: role 'admin', not the owner,
 * confined to one branch, and holding a permission list written before the
 * floor plan and the kitchen board had keys of their own.
 */
const branchManager: TabVisibilityContext = {
  ...owner,
  caller: {
    role: "admin",
    isOwner: false,
    permissions: [
      "orders",
      "menu",
      "analytics",
      "store_setup",
      "customers",
      "settings",
      "pos",
      "branch_staff",
      "order_edit",
      "order_refund",
      "vouchers",
    ],
  },
  audience: {
    accountScope: { kind: "branch", outletId: "outlet-1" },
    activeOutletCount: 3,
    isDemo: false,
  },
};

describe("isTabReachable", () => {
  it("lets an owner reach every registered tab", () => {
    for (const workspace of WORKSPACES) {
      for (const tab of workspace.tabs) {
        expect(isTabReachable(tab, owner)).toBe(true);
      }
    }
  });

  it("hides Scheduled from a store that never takes pre-orders", () => {
    expect(isTabReachable("scheduled", { ...owner, takesAdvanceOrders: false })).toBe(false);
    expect(isTabReachable("orders", { ...owner, takesAdvanceOrders: false })).toBe(true);
  });

  it("hides Business tabs from a single-branch store", () => {
    const single = { ...owner, audience: { ...owner.audience, activeOutletCount: 1 } };
    expect(isTabReachable("portfolio", single)).toBe(false);
    expect(isTabReachable("branches", single)).toBe(false);
    expect(isTabReachable("dashboard", single)).toBe(true);
  });

  it("honours staff permissions", () => {
    expect(isTabReachable("pos", posOnlyStaff)).toBe(true);
    expect(isTabReachable("orders", posOnlyStaff)).toBe(false);
    expect(isTabReachable("customers", posOnlyStaff)).toBe(false);
  });

  it("always lets an account reach the Manage hub", () => {
    expect(isTabReachable(MENU_TAB, posOnlyStaff)).toBe(true);
  });

  it("gives an account the Reports hub exactly when it can open at least one report", () => {
    expect(isTabReachable(REPORTS_TAB, owner)).toBe(true);
    // A cashier with only the POS grant can read no report, so there is no
    // hub to open — a tab that lands on an empty list reads as a broken app.
    expect(isTabReachable(REPORTS_TAB, posOnlyStaff)).toBe(false);
    const analyst = { ...owner, caller: { ...owner.caller, isOwner: false, permissions: ["analytics"] } };
    expect(isTabReachable(REPORTS_TAB, analyst)).toBe(true);
  });
});

describe("the bar", () => {
  it("is five slots, left to right: Home, Orders, POS, Reports, Manage", () => {
    expect(barTabs(owner)).toEqual(["dashboard", "orders", "pos", "reports", "menu"]);
  });

  it("never changes shape for a single-branch store or a store without pre-orders", () => {
    // The whole point: the bar is the same bar wherever the merchant is, and
    // whatever the store is configured to do.
    const single = { ...owner, audience: { ...owner.audience, activeOutletCount: 1 } };
    expect(barTabs(single)).toEqual(barTabs(owner));
    expect(barTabs({ ...owner, takesAdvanceOrders: false })).toEqual(barTabs(owner));
  });

  it("gives a cook the Kitchen board in the Orders slot", () => {
    // A cook's tablet holds only the kitchen grant. Orders is out of reach, so
    // the board takes its slot instead of leaving a hole in the bar.
    expect(barTabs(cook)).toEqual(["dashboard", "kitchen", "menu"]);
    expect(isTabOnBar("kitchen", cook)).toBe(true);
    expect(isTabOnBar("orders", cook)).toBe(false);
  });

  it("gives a branch manager the floor plan and the pass their grant contains", () => {
    // The list above predates both keys. Without containment the manager gets
    // the order queue but no Tables and no Kitchen, which is the bug this
    // covers: a merchant turns on dine-in and only the owner can seat anyone.
    expect(isTabReachable("tables", branchManager)).toBe(true);
    expect(isTabReachable("kitchen", branchManager)).toBe(true);
    expect(subscreensOf("orders", branchManager).map((link) => link.tab)).toEqual([
      "kitchen",
      "tables",
      "scheduled",
    ]);
  });

  it("still hides the floor plan from a store that seats nobody", () => {
    expect(isTabReachable("tables", { ...branchManager, takesDineIn: false })).toBe(false);
  });

  it("keeps Kitchen off the bar when Orders is there", () => {
    expect(isTabOnBar("kitchen", owner)).toBe(false);
  });

  it("drops the slots a cashier cannot open", () => {
    expect(barTabs(posOnlyStaff)).toEqual(["dashboard", "pos", "menu"]);
  });

  it("never puts a sub-screen, a report or a setup screen on it", () => {
    for (const tab of [...SUBSCREEN_TABS, ...REPORT_TABS, ...SETUP_TABS]) {
      if (tab === "kitchen") continue; // the one slot fallback, covered above
      expect(isTabOnBar(tab, owner)).toBe(false);
    }
  });

  it("lists every slot candidate as a real screen", () => {
    const known = new Set([...WORKSPACES.flatMap((w) => [...w.tabs]), ...HUB_TABS]);
    for (const slot of BAR_SLOTS) {
      for (const tab of slot) expect(known.has(tab)).toBe(true);
    }
  });
});

describe("the map is complete", () => {
  it("places every registered tab on the bar, under a parent, or in a hub — exactly once", () => {
    // A screen in the registry but nowhere on the map is a screen nobody can
    // reach; a screen in two places is two doors that will drift apart.
    const registered = WORKSPACES.flatMap((w) => [...w.tabs]);
    const placed = [
      ...BAR_SLOTS.flatMap((slot) => slot.filter((tab) => !HUB_TABS.includes(tab))),
      ...SUBSCREEN_TABS.filter((tab) => tab !== "kitchen"), // kitchen is also a slot fallback
      ...REPORT_TABS,
      ...SETUP_TABS,
    ];

    expect([...placed].sort()).toEqual([...registered].sort());
    expect(new Set(placed).size).toBe(placed.length);
  });
});

describe("reachableTabsOf", () => {
  it("lists a section's reachable tabs in registry order", () => {
    expect(reachableTabsOf("operations", { ...owner, takesAdvanceOrders: false })).toEqual([
      "dashboard",
      "orders",
      "kitchen",
      "tables",
    ]);
    // A shop that seats nobody has no floor to show.
    expect(reachableTabsOf("operations", { ...owner, takesDineIn: false })).toEqual([
      "dashboard",
      "orders",
      "kitchen",
      "scheduled",
    ]);
    expect(reachableTabsOf("products", owner)).toEqual([...getWorkspace("products").tabs]);
  });
});
