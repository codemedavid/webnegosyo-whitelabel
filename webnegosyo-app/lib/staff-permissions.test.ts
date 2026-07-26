import {
  hasPermission,
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
});

describe("isTabAllowed", () => {
  it("always allows the dashboard and utility screens", () => {
    expect(isTabAllowed(ordersOnly, "dashboard")).toBe(true);
    expect(isTabAllowed(ordersOnly, "account")).toBe(true);
  });

  it("gates orders, insights, and product tabs by permission", () => {
    expect(isTabAllowed(ordersOnly, "orders")).toBe(true);
    expect(isTabAllowed(ordersOnly, "growth")).toBe(false);
    expect(isTabAllowed(ordersOnly, "trends")).toBe(false);
    expect(isTabAllowed(ordersOnly, "product-management")).toBe(false);
    expect(isTabAllowed(menuOnly, "product-management")).toBe(true);
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
  it("returns all four views for the owner", () => {
    expect(allowedWorkspaces(owner).map((w) => w.key)).toEqual([
      "operations",
      "register",
      "insights",
      "products",
    ]);
  });

  it("drops views with no permitted tabs and filters tabs inside kept views", () => {
    const views = allowedWorkspaces(ordersOnly);
    expect(views.map((w) => w.key)).toEqual(["operations"]);
    expect(views[0].tabs).toEqual(["dashboard", "orders"]);
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
    expect(products!.tabs).toEqual(["product-management"]);
    expect(products!.defaultTab).toBe("product-management");
  });
});
