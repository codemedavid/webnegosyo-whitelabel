import {
  WORKSPACES,
  getWorkspace,
  isTabInWorkspace,
  workspaceForTab,
  defaultTabHref,
} from "./workspaces";

describe("WORKSPACES registry", () => {
  it("defines the four merchant views", () => {
    expect(WORKSPACES.map((w) => w.key)).toEqual([
      "operations",
      "register",
      "insights",
      "products",
    ]);
  });

  it("keeps operations first so getWorkspace's fallback stays the order queue", () => {
    expect(WORKSPACES[0].key).toBe("operations");
  });

  it("keeps every workspace's default tab inside its own tab list", () => {
    for (const workspace of WORKSPACES) {
      expect(workspace.tabs).toContain(workspace.defaultTab);
    }
  });

  it("never shares a tab between two workspaces", () => {
    const allTabs = WORKSPACES.flatMap((w) => [...w.tabs]);
    expect(new Set(allTabs).size).toBe(allTabs.length);
  });

  it("gives each workspace a label and at least one tab", () => {
    for (const workspace of WORKSPACES) {
      expect(workspace.label.length).toBeGreaterThan(0);
      expect(workspace.tabs.length).toBeGreaterThan(0);
    }
  });
});

describe("getWorkspace", () => {
  it("returns the workspace for a valid key", () => {
    expect(getWorkspace("insights").key).toBe("insights");
  });

  it("falls back to operations for an unknown key", () => {
    expect(getWorkspace("bogus").key).toBe("operations");
  });
});

describe("isTabInWorkspace", () => {
  it("shows order management tabs only in the operations view", () => {
    expect(isTabInWorkspace("orders", "operations")).toBe(true);
    expect(isTabInWorkspace("orders", "insights")).toBe(false);
    expect(isTabInWorkspace("orders", "products")).toBe(false);
  });

  it("shows analytics tabs only in the insights view", () => {
    expect(isTabInWorkspace("analytics", "insights")).toBe(true);
    expect(isTabInWorkspace("growth", "insights")).toBe(true);
    expect(isTabInWorkspace("trends", "insights")).toBe(true);
    expect(isTabInWorkspace("analytics", "operations")).toBe(false);
  });

  it("shows counter-sale tabs only in the register view", () => {
    expect(isTabInWorkspace("pos", "register")).toBe(true);
    expect(isTabInWorkspace("pos-sales", "register")).toBe(true);
    expect(isTabInWorkspace("pos", "operations")).toBe(false);
    expect(isTabInWorkspace("orders", "register")).toBe(false);
  });

  it("shows product tabs only in the products view", () => {
    expect(isTabInWorkspace("product-analytics", "products")).toBe(true);
    expect(isTabInWorkspace("product-management", "products")).toBe(true);
    expect(isTabInWorkspace("product-analytics", "operations")).toBe(false);
  });

  it("keeps inventory beside the products it is spent on", () => {
    // Stock is a property of the menu, not of the order queue: a merchant who
    // 86s an item and a merchant who reorders its flour are the same person.
    expect(isTabInWorkspace("inventory", "products")).toBe(true);
    expect(isTabInWorkspace("inventory", "operations")).toBe(false);
  });
});

describe("workspaceForTab", () => {
  it("maps a tab back to its owning workspace", () => {
    expect(workspaceForTab("dashboard")).toBe("operations");
    expect(workspaceForTab("pos")).toBe("register");
    expect(workspaceForTab("growth")).toBe("insights");
    expect(workspaceForTab("product-management")).toBe("products");
    expect(workspaceForTab("inventory")).toBe("products");
  });

  it("returns undefined for detail/utility screens outside any workspace", () => {
    expect(workspaceForTab("scan")).toBeUndefined();
    expect(workspaceForTab("order/[orderId]")).toBeUndefined();
    expect(workspaceForTab("account")).toBeUndefined();
  });
});

describe("defaultTabHref", () => {
  it("builds a fully-substituted (main) route for each workspace", () => {
    expect(defaultTabHref("operations")).toBe("/(main)/dashboard");
    expect(defaultTabHref("register")).toBe("/(main)/pos");
    expect(defaultTabHref("insights")).toBe("/(main)/analytics");
    expect(defaultTabHref("products")).toBe("/(main)/product-analytics");
  });
});
