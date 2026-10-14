import {
  OPT_IN_PERMISSION_KEYS,
  ORDER_READ_KEYS,
  PAYMENT_READ_KEYS,
  canReadOrders,
  canReadPayments,
  hasAnyPermission,
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
const stockClerk: StaffPermissionHolder = {
  role: "admin",
  isOwner: false,
  permissions: ["inventory"],
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
    expect(impliedPermissions(["analytics"])).toEqual(["reports"]);
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
    expect(isTabAllowed(ordersOnly, "inventory")).toBe(false);
    expect(isTabAllowed(menuOnly, "orders")).toBe(false);
  });

  // Stock was carved out of "menu" into its own key; the database gave it to
  // every menu holder once, so a stored list without it is a deliberate choice.
  it("gates the stock screen on the inventory key, not menu", () => {
    expect(isTabAllowed(stockClerk, "inventory")).toBe(true);
    expect(isTabAllowed(menuOnly, "inventory")).toBe(false);
    expect(isTabAllowed(stockClerk, "product-management")).toBe(false);
  });

  // The daily report is priced throughout — stock used, wasted and missing are
  // all pesos, and its headline is food cost %. Whoever opens it sees costs.
  it("gates the daily report on the costs key", () => {
    const costs: StaffPermissionHolder = { role: "admin", isOwner: false, permissions: ["costs"] };
    expect(isTabAllowed(costs, "daily-report")).toBe(true);
    expect(isTabAllowed(stockClerk, "daily-report")).toBe(false);
    expect(isTabAllowed(menuOnly, "daily-report")).toBe(false);
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
    // Menu alone is the menu: stock rides "inventory" and the priced daily
    // report rides "costs" — every menu holder was given both in the database.
    expect(products!.tabs).toEqual(["product-management", "categories"]);
    expect(products!.defaultTab).toBe("product-management");
  });

  it("keeps the stock and its report for a menu holder given both carved-out keys", () => {
    const backfilled: StaffPermissionHolder = {
      role: "admin",
      isOwner: false,
      permissions: ["menu", "inventory", "costs"],
    };
    const products = allowedWorkspaces(backfilled).find((w) => w.key === "products");
    expect(products!.tabs).toEqual([
      "product-management",
      "categories",
      "inventory",
      "daily-report",
    ]);
  });
});

describe("order and payment reads", () => {
  // Mirrors of the web registry; staff-permissions-parity.test.ts pins them.
  it("lists who may read orders, and who may read the money taken on them", () => {
    expect([...ORDER_READ_KEYS]).toEqual(["orders", "pos", "kitchen", "tables", "analytics", "reports"]);
    expect([...PAYMENT_READ_KEYS]).toEqual(["orders", "pos", "tables", "analytics", "reports"]);
  });

  it("holds any of the listed keys, through containment too", () => {
    expect(hasAnyPermission(cashier, ["menu", "pos"])).toBe(true);
    expect(hasAnyPermission(menuOnly, ["orders", "pos"])).toBe(false);
    expect(hasAnyPermission(ordersOnly, ["kitchen"])).toBe(true);
    expect(hasAnyPermission(owner, [])).toBe(false);
  });

  // The database refuses orders to an account holding none of these, so the
  // phone must not ask — a refused read comes back empty and reads as ₱0.
  it("lets every order-facing grant read orders, and nothing else", () => {
    expect(canReadOrders(owner)).toBe(true);
    expect(canReadOrders(legacyAdmin)).toBe(true);
    expect(canReadOrders(cashier)).toBe(true);
    expect(canReadOrders({ role: "admin", isOwner: false, permissions: ["kitchen"] })).toBe(true);
    expect(canReadOrders({ role: "admin", isOwner: false, permissions: ["analytics"] })).toBe(true);
    expect(canReadOrders({ role: "admin", isOwner: false, permissions: ["reports"] })).toBe(true);
    expect(canReadOrders(menuOnly)).toBe(false);
    expect(canReadOrders(stockClerk)).toBe(false);
    expect(canReadOrders({ role: "admin", isOwner: false, permissions: ["branch_staff"] })).toBe(false);
  });

  it("keeps the till away from the kitchen display", () => {
    expect(canReadPayments({ role: "admin", isOwner: false, permissions: ["kitchen"] })).toBe(false);
    expect(canReadPayments(cashier)).toBe(true);
    expect(canReadPayments(owner)).toBe(true);
  });
});

describe("opt-in permissions", () => {
  it("are not granted by full access, only by the owner or a tick", () => {
    for (const key of OPT_IN_PERMISSION_KEYS) {
      expect(hasPermission(legacyAdmin, key)).toBe(false);
      expect(hasPermission(owner, key)).toBe(true);
      expect(hasPermission({ role: "admin", isOwner: false, permissions: [key] }, key)).toBe(true);
    }
  });

  it("leave every other key on full access, as before", () => {
    expect(hasPermission(legacyAdmin, "orders")).toBe(true);
    expect(hasPermission(legacyAdmin, "order_refund")).toBe(true);
  });
});
