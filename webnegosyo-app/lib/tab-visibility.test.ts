import {
  isTabReachable,
  isTabOnBar,
  reachableTabsOf,
  SETUP_TABS,
  MENU_TAB,
  type TabVisibilityContext,
} from "./tab-visibility";
import { getWorkspace } from "./workspaces";

const owner: TabVisibilityContext = {
  caller: { role: "admin", isOwner: true, permissions: null },
  audience: {
    accountScope: { kind: "all" },
    activeOutletCount: 3,
    isDemo: false,
  },
  takesAdvanceOrders: true,
};

const posOnlyStaff: TabVisibilityContext = {
  ...owner,
  caller: { role: "admin", isOwner: false, permissions: ["pos"] },
};

describe("isTabReachable", () => {
  it("lets an owner reach every registered tab", () => {
    for (const workspace of ["operations", "register", "insights", "products", "business"] as const) {
      for (const tab of getWorkspace(workspace).tabs) {
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

  it("always lets an account reach the Menu hub", () => {
    expect(isTabReachable(MENU_TAB, posOnlyStaff)).toBe(true);
  });
});

describe("isTabOnBar", () => {
  it("shows only the active view's tabs plus the Menu hub", () => {
    expect(isTabOnBar("orders", "operations", owner)).toBe(true);
    expect(isTabOnBar("orders", "insights", owner)).toBe(false);
    expect(isTabOnBar(MENU_TAB, "operations", owner)).toBe(true);
    expect(isTabOnBar(MENU_TAB, "products", owner)).toBe(true);
  });

  it("keeps store-setup screens off the bar even in their own view", () => {
    // Payments is reachable (through the Menu hub) but never a tab: the
    // Products bar would otherwise run to six tabs and truncate every label.
    expect(SETUP_TABS).toContain("payments");
    expect(isTabReachable("payments", owner)).toBe(true);
    expect(isTabOnBar("payments", "products", owner)).toBe(false);
  });

  it("never puts a tab on the bar that the account cannot reach", () => {
    expect(isTabOnBar("orders", "operations", posOnlyStaff)).toBe(false);
    expect(isTabOnBar("scheduled", "operations", { ...owner, takesAdvanceOrders: false })).toBe(false);
  });
});

describe("reachableTabsOf", () => {
  it("lists a view's reachable tabs in registry order", () => {
    expect(reachableTabsOf("operations", { ...owner, takesAdvanceOrders: false })).toEqual([
      "dashboard",
      "orders",
      "kitchen",
    ]);
  });

  it("keeps setup screens in the list so the Menu hub can offer them", () => {
    expect(reachableTabsOf("products", owner)).toContain("payments");
  });
});
