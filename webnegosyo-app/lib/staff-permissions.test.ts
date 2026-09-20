import {
  hasPermission,
  impliedPermissions,
  isTabAllowed,
  allowedWorkspaces,
  type StaffPermissionHolder,
} from "./staff-permissions";

const owner: StaffPermissionHolder = {
  role: "admin",
  isOwner: true,
  permissions: null,
};
const legacyAdmin: StaffPermissionHolder = {
  role: "admin",
  isOwner: false,
  permissions: null,
};
const ordersOnly: StaffPermissionHolder = {
  role: "admin",
  isOwner: false,
  permissions: ["orders"],
};
const menuOnly: StaffPermissionHolder = {
  role: "admin",
  isOwner: false,
  permissions: ["menu"],
};
const cashier: StaffPermissionHolder = {
  role: "admin",
  isOwner: false,
  permissions: ["pos"],
};

describe("hasPermission", () => {
  it("grants everything to owners, superadmins, and legacy null-permission admins", () => {
    expect(hasPermission(owner, "analytics")).toBe(true);
    expect(hasPermission({ role: "superadmin", isOwner: false, permissions: [] }, "menu")).toBe(
      true,
    );
    expect(hasPermission(legacyAdmin, "analytics")).toBe(true);
  });

  it("restricts staff to their granted keys", () => {
    expect(hasPermission(ordersOnly, "orders")).toBe(true);
    expect(hasPermission(ordersOnly, "analytics")).toBe(false);
  });

  // 'kitchen' and 'tables' were carved out of 'orders' after these accounts
  // were created, and a stored permission list cannot grow on its own — so the
  // pass and the floor vanished for every staff member already holding the
  // queue they are slices of.
  it("grants the pass and the floor through the order queue that contains them", () => {
    expect(hasPermission(ordersOnly, "kitchen")).toBe(true);
    expect(hasPermission(ordersOnly, "tables")).toBe(true);
  });

  it("does not read containment backwards", () => {
    const host: StaffPermissionHolder = { role: "admin", isOwner: false, permissions: ["tables"] };
    expect(hasPermission(host, "orders")).toBe(false);
    expect(hasPermission(host, "kitchen")).toBe(false);
  });

  it("leaves separate authorities opt-in", () => {
    expect(hasPermission(ordersOnly, "order_edit")).toBe(false);
    expect(hasPermission(ordersOnly, "order_refund")).toBe(false);
    expect(hasPermission(ordersOnly, "loyalty_manage")).toBe(false);
    expect(hasPermission(ordersOnly, "pos")).toBe(false);
  });
});

describe("impliedPermissions", () => {
  it("names the keys reached only through a broader grant", () => {
    expect(impliedPermissions(["orders"])).toEqual(["kitchen", "tables"]);
    expect(impliedPermissions(["orders", "tables"])).toEqual(["kitchen"]);
    expect(impliedPermissions(["pos"])).toEqual([]);
    expect(impliedPermissions(null)).toEqual([]);
  });
});

describe("isTabAllowed", () => {
  it("always allows the dashboard and utility screens", () => {
    expect(isTabAllowed(ordersOnly, "dashboard")).toBe(true);
    expect(isTabAllowed(ordersOnly, "account")).toBe(true);
  });

  it("opens the floor plan to an account that holds the order queue", () => {
    expect(isTabAllowed(ordersOnly, "tables")).toBe(true);
    expect(isTabAllowed(ordersOnly, "kitchen")).toBe(true);
    expect(isTabAllowed(cashier, "tables")).toBe(false);
  });

  it("gates orders, insights, and product tabs by permission", () => {
    expect(isTabAllowed(ordersOnly, "orders")).toBe(true);
    expect(isTabAllowed(ordersOnly, "growth")).toBe(false);
    expect(isTabAllowed(ordersOnly, "trends")).toBe(false);
    expect(isTabAllowed(ordersOnly, "product-management")).toBe(false);
    expect(isTabAllowed(menuOnly, "product-management")).toBe(true);
    // Reordering an ingredient is a menu decision, so it rides the same key.
    expect(isTabAllowed(menuOnly, "inventory")).toBe(true);
    expect(isTabAllowed(ordersOnly, "inventory")).toBe(false);
    expect(isTabAllowed(menuOnly, "orders")).toBe(false);
  });

  it("gates the register tabs behind the pos permission", () => {
    expect(isTabAllowed(cashier, "pos")).toBe(true);
    expect(isTabAllowed(cashier, "pos-sales")).toBe(true);
    expect(isTabAllowed(ordersOnly, "pos")).toBe(false);
    expect(isTabAllowed(ordersOnly, "pos-sales")).toBe(false);
  });
});

describe("allowedWorkspaces", () => {
  it("returns every view for the owner", () => {
    // Business is listed here because permissions do not exclude it. Whether it
    // is actually offered also depends on the store having branches, which is
    // isPortfolioAvailable's job, not this registry's.
    expect(allowedWorkspaces(owner).map((w) => w.key)).toEqual([
      "operations",
      "register",
      "insights",
      "products",
      "business",
    ]);
  });

  it("drops views with no permitted tabs and filters tabs inside kept views", () => {
    const views = allowedWorkspaces(ordersOnly);
    expect(views.map((w) => w.key)).toEqual(["operations"]);
    // The scheduled agenda rides the same orders grant as the queue it re-sorts,
    // and the pass and the floor are slices of that queue (IMPLIED_BY).
    expect(views[0].tabs).toEqual(["dashboard", "orders", "kitchen", "tables", "scheduled"]);
  });

  it("gives a pos-only cashier the register view and nothing else", () => {
    const views = allowedWorkspaces(cashier);
    expect(views.map((w) => w.key)).toEqual(["operations", "register"]);
    // Dashboard is open to all staff, so operations survives with just that tab.
    expect(views[0].tabs).toEqual(["dashboard"]);
    expect(views[1].tabs).toEqual(["pos", "pos-sales"]);
    expect(views[1].defaultTab).toBe("pos");
  });

  it("repoints defaultTab when the original default is not permitted", () => {
    const views = allowedWorkspaces(menuOnly);
    const products = views.find((w) => w.key === "products");
    expect(products).toBeDefined();
    // The daily report rides the same `menu` grant as the shelf it reconciles,
    // so it survives this filter alongside inventory.
    expect(products!.tabs).toEqual([
      "product-management",
      "categories",
      "inventory",
      "daily-report",
    ]);
    expect(products!.defaultTab).toBe("product-management");
  });
});
