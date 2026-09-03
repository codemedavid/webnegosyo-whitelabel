import { enterTenant, exitTenant, type ImpersonationState } from "./impersonation";
import { formatReceipt } from "./receipt-formatter";
import { buildReceiptSegments, buildReceiptText } from "./receipt-print";
import { resolveSession, type AppUserRow, type TenantRow } from "./session-resolve";

/**
 * The saved receipt layout lives on the tenant row. These tests pin the whole
 * delivery path: sign-in and impersonation must carry it into the auth store,
 * and the print path must render with it — falling back to Classic whenever
 * nothing (or garbage) was saved. A dropped projection or an unwritten patch
 * field here silently reverts every tenant to Classic (see the
 * branding-mobile-overrides incident).
 */

const order = {
  _id: "abcdef1234567890",
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: "Walk-in",
  customerContact: "n/a",
  total: 327.5,
  items: [{ menuItemName: "Latte", quantity: 2, subtotal: 327.5 }],
};

describe("buildReceiptText — what the printer receives", () => {
  it("prints Classic when the tenant saved nothing", () => {
    expect(buildReceiptText(order, "Kape Co", null)).toBe(
      formatReceipt(order, { storeName: "Kape Co" }),
    );
  });

  it("prints Classic when the saved layout is garbage", () => {
    expect(buildReceiptText(order, "Kape Co", { version: 99 })).toBe(
      formatReceipt(order, { storeName: "Kape Co" }),
    );
  });

  it("prints the saved preset when the tenant chose one", () => {
    const compact = buildReceiptText(order, "Kape Co", "compact");
    expect(compact).not.toBe(formatReceipt(order, { storeName: "Kape Co" }));
    expect(compact).toContain("KAPE CO");
    expect(compact).toContain("P327.50");
  });

  it("prints a saved custom layout", () => {
    const text = buildReceiptText(order, "Kape Co", {
      version: 1,
      blocks: [{ kind: "businessName" }, { kind: "totals" }],
    });
    expect(text).toContain("KAPE CO");
    expect(text).toContain("TOTAL:");
    expect(text).not.toContain("Latte");
  });
});

describe("buildReceiptSegments — logo delivery to the printer", () => {
  const logoLayout = { version: 1, blocks: [{ kind: "logo" }, { kind: "totals" }] };

  it("emits an image segment when the tenant has a logo", () => {
    const segments = buildReceiptSegments(
      order,
      "Kape Co",
      logoLayout,
      null,
      "https://ik.example/logo.png",
    );
    expect(segments[0]).toEqual({ type: "image", url: "https://ik.example/logo.png" });
  });

  it("prints logo-less when no logo URL is known", () => {
    const segments = buildReceiptSegments(order, "Kape Co", logoLayout, null);
    expect(segments.every((s) => s.type === "text")).toBe(true);
  });
});

const merchantUser: AppUserRow = {
  tenant_id: "t1",
  role: "admin",
  is_owner: true,
  permissions: null,
};

const tenant: TenantRow = {
  id: "t1",
  slug: "kape",
  name: "Kape Co",
  convex_deployment_url: null,
  order_backend: "platform",
  receipt_layout: "compact",
  logo_url: "https://ik.example/kape.png",
};

describe("session resolution carries the saved layout", () => {
  it("hands the tenant's receipt_layout to the auth store", () => {
    const result = resolveSession("u1", merchantUser, tenant);
    expect(result.auth?.receiptLayout).toBe("compact");
  });

  it("defaults to null when the tenant row has no saved layout", () => {
    const bare = { ...tenant };
    delete bare.receipt_layout;
    const result = resolveSession("u1", merchantUser, bare);
    expect(result.auth?.receiptLayout).toBeNull();
  });

  it("hands the tenant's logo_url to the auth store for the logo block", () => {
    const result = resolveSession("u1", merchantUser, tenant);
    expect(result.auth?.receiptLogoUrl).toBe("https://ik.example/kape.png");
  });

  it("defaults the logo to null when the row has none", () => {
    const bare = { ...tenant };
    delete bare.logo_url;
    const result = resolveSession("u1", merchantUser, bare);
    expect(result.auth?.receiptLogoUrl).toBeNull();
  });
});

describe("impersonation carries the saved layout", () => {
  const superadmin: ImpersonationState & { receiptLayout: unknown } = {
    userId: "sa",
    tenantId: null,
    tenantSlug: null,
    tenantName: null,
    convexUrl: null,
    orderBackend: null,
    isSuperadmin: true,
    isOwner: false,
    permissions: null,
    role: "superadmin",
    impersonatedTenantId: null,
    receiptLayout: null,
  };

  it("entering a tenant adopts that tenant's layout", () => {
    const patch = enterTenant(superadmin, tenant);
    expect(patch.receiptLayout).toBe("compact");
  });

  it("entering a tenant adopts that tenant's logo for receipts", () => {
    const patch = enterTenant(superadmin, tenant);
    expect(patch.receiptLogoUrl).toBe("https://ik.example/kape.png");
  });

  it("leaving a tenant clears the layout — a stale one would style the next store's receipts", () => {
    const patch = exitTenant({ ...superadmin, impersonatedTenantId: "t1" });
    expect(patch.receiptLayout).toBeNull();
    expect(patch.receiptLogoUrl).toBeNull();
  });
});
