/**
 * Guardrails for the merchant app's Payment Methods screens.
 *
 * Jest here only runs pure-logic roots (lib/, theme/), so — like the other
 * mount guardrails in this directory — this asserts on the screen sources
 * rather than rendering them. What it locks down is the wiring a unit test of
 * the pure module cannot see: that the tab exists and is gated, that a cashier
 * cannot reach the store's payment settings, and that the screens defer to the
 * shared reads and writes instead of querying Supabase beside the JSX.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { getWorkspace, workspaceForTab } from "./workspaces";
import { isTabAllowed } from "./staff-permissions";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("payments tab registration", () => {
  it("belongs to the Products view, beside the rest of store setup", () => {
    expect(workspaceForTab("payments")).toBe("products");
    expect(getWorkspace("products").tabs).toContain("payments");
  });

  it("has a route file, so registering it cannot break the tab bar", () => {
    expect(existsSync(join(ROOT, "app", "(main)", "payments.tsx"))).toBe(true);
  });

  it("registers the editor as a routable screen that is not itself a tab", () => {
    const layout = read("app", "(main)", "_layout.tsx");

    expect(existsSync(join(ROOT, "app", "(main)", "payment", "[methodId].tsx"))).toBe(
      true,
    );
    expect(layout).toMatch(/name="payment\/\[methodId\]"[\s\S]{0,120}href: null/);
  });
});

describe("payments permission", () => {
  const cashier = {
    role: "admin",
    isOwner: false,
    permissions: ["pos", "orders"],
  };
  const manager = {
    role: "admin",
    isOwner: false,
    permissions: ["pos", "orders", "store_setup"],
  };

  it("keeps a cashier out of the store's payment settings", () => {
    // An unmapped tab defaults to allowed, which would hand every cashier the
    // power to retire the merchant's GCash account mid-shift.
    expect(isTabAllowed(cashier, "payments")).toBe(false);
  });

  it("lets a staff member granted store setup in", () => {
    expect(isTabAllowed(manager, "payments")).toBe(true);
  });
});

describe("payments list screen", () => {
  const screen = () => read("app", "(main)", "payments.tsx");

  it("loads through the shared read rather than querying Supabase inline", () => {
    expect(screen()).toMatch(/listManagedPaymentMethods/);
    expect(screen()).not.toMatch(/from\("payment_methods"\)/);
  });

  it("waits for a tenant before loading", () => {
    expect(screen()).toMatch(/if \(!tenantId\) return/);
  });

  it("offers a retry when the read fails instead of an empty list", () => {
    expect(screen()).toMatch(/ErrorState/);
  });

  it("lets the merchant pull the list down to refresh it", () => {
    expect(screen()).toMatch(/RefreshControl/);
  });

  it("keeps the workspace switcher so the tab is escapable", () => {
    expect(screen()).toMatch(/WorkspaceSwitcher/);
  });

  it("blocks the demo session from changing a real store's settings", () => {
    expect(screen()).toMatch(/isDemo/);
    expect(screen()).toMatch(/DEMO_READONLY_MESSAGE/);
  });

  it("names a method that is offered nowhere through the shared rule", () => {
    // Silently listing it as if it were live is the failure the flag exists to
    // prevent; re-deriving the rule here would be a second opinion on it.
    expect(screen()).toMatch(/isOfferedNowhere/);
    expect(screen()).not.toMatch(/order_type_ids\.length === 0/);
  });

  it("reorders through the shared pure move rather than beside the JSX", () => {
    expect(screen()).toMatch(/moveMethod/);
    expect(screen()).toMatch(/reorderPaymentMethods/);
  });
});

describe("payment method editor screen", () => {
  const screen = () => read("app", "(main)", "payment", "[methodId].tsx");

  it("derives its form from the shared builder, so Add never shows the last edit", () => {
    expect(screen()).toMatch(/buildEditorFormState/);
  });

  it("validates through the shared rules before saving", () => {
    expect(screen()).toMatch(/validatePaymentMethodInput/);
  });

  it("blocks every write in the demo session", () => {
    // Save, delete and the QR upload each reach a real store, so each needs
    // its own guard — one guard on save would leave the other two open.
    const guards = screen().match(/isDemo/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(3);
  });

  it("waits for a tenant before loading or saving", () => {
    expect(screen()).toMatch(/if \(!tenantId\) return/);
  });

  it("offers the tenant's order types to tick rather than free text", () => {
    expect(screen()).toMatch(/listOrderTypes/);
  });

  it("uploads the QR into its own ImageKit folder", () => {
    expect(screen()).toMatch(/uploadPaymentQr/);
  });

  it("navigates with goTo after creating, never router.replace", () => {
    // router.replace inside the (main) tab tree renames its state key and
    // remounts it, crashing with "Cannot read property 'stale' of undefined".
    expect(screen()).toMatch(/goTo\(router,/);
    expect(screen()).not.toMatch(/router\.replace/);
  });
});
