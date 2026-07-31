/**
 * Guardrails for the merchant app's Branch Products screen.
 *
 * Jest here only runs pure-logic roots (lib/, theme/), so — like the other
 * mount guardrails in this directory — this asserts on the screen source rather
 * than rendering it. What it locks down is the wiring a unit test of the pure
 * module cannot see: that the tab is registered in all three places a tab has
 * to be registered, that a cashier cannot delist dishes chain-wide, and that
 * the screen defers to the shared read, write and resolution rules instead of
 * forming a second opinion beside the JSX.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { getWorkspace, workspaceForTab } from "./workspaces";
import { isTabAllowed } from "./staff-permissions";
import { isBusinessTabVisible } from "./portfolio-landing";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

/**
 * The same source with comments stripped, for asserting a call is absent.
 * Explaining in prose why a bare `is_available` write would be wrong here is
 * exactly what a screen should do, and a whole-file regex cannot tell that
 * apart from making the call.
 */
function readCode(...segments: string[]): string {
  return read(...segments)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const screen = () => read("app", "(main)", "branch-menu.tsx");

describe("branch products tab registration", () => {
  it("belongs to the Business view, beside the branches it is about", () => {
    expect(workspaceForTab("branch-menu")).toBe("business");
    expect(getWorkspace("business").tabs).toContain("branch-menu");
  });

  it("has a route file, so registering it cannot break the tab bar", () => {
    expect(existsSync(join(ROOT, "app", "(main)", "branch-menu.tsx"))).toBe(true);
  });

  it("is registered in the tab layout with the same visibility gate", () => {
    expect(read("app", "(main)", "_layout.tsx")).toMatch(
      /name="branch-menu"[\s\S]{0,160}href: show\("branch-menu"\)/,
    );
  });

  it("is hidden from a store that does not run several branches", () => {
    // The tab bar is a second door into the screen: a Business tab left
    // registered for a single-location merchant is one tap away from a
    // cross-branch editor for branches they do not have.
    const single = { accountScope: { kind: "all" } as never, activeOutletCount: 1 };
    const chain = { accountScope: { kind: "all" } as never, activeOutletCount: 3 };

    expect(isBusinessTabVisible("branch-menu", single)).toBe(false);
    expect(isBusinessTabVisible("branch-menu", chain)).toBe(true);
  });
});

describe("branch products permission", () => {
  const cashier = { role: "admin", isOwner: false, permissions: ["pos", "orders"] };
  const menuStaff = { role: "admin", isOwner: false, permissions: ["pos", "menu"] };

  it("keeps a cashier from delisting dishes across the chain", () => {
    // An unmapped tab defaults to allowed, which would let anyone with the POS
    // grant take a dish off another branch's board.
    expect(isTabAllowed(cashier, "branch-menu")).toBe(false);
  });

  it("lets staff granted the menu in", () => {
    expect(isTabAllowed(menuStaff, "branch-menu")).toBe(true);
  });
});

describe("branch products screen", () => {
  it("loads products and overrides through the shared reads", () => {
    expect(screen()).toMatch(/listProducts/);
    expect(screen()).toMatch(/listBranchMenuOverrides/);
    expect(readCode("app", "(main)", "branch-menu.tsx")).not.toMatch(
      /from\("outlet_menu_items"\)/,
    );
  });

  it("builds its rows from the shared resolution rather than re-deriving them", () => {
    // A second opinion here would disagree with the storefront and the
    // register about what a branch sells and for how much.
    expect(screen()).toMatch(/buildBranchProductRows/);
    expect(screen()).toMatch(/buildOutletMenuIndex/);
  });

  it("writes a switch through the shared plan, never a bare column update", () => {
    expect(screen()).toMatch(/setBranchListing/);
  });

  it("waits for a tenant before loading", () => {
    expect(screen()).toMatch(/if \(!tenantId\) return/);
  });

  it("offers a retry when the read fails instead of an empty menu", () => {
    // An empty list here reads as "no branch differences", which is the one
    // wrong thing this screen can say.
    expect(screen()).toMatch(/ErrorState/);
  });

  it("lets the merchant pull the list down to refresh it", () => {
    expect(screen()).toMatch(/RefreshControl/);
  });

  it("keeps the workspace switcher so the tab is escapable", () => {
    expect(screen()).toMatch(/WorkspaceSwitcher/);
  });

  it("blocks the demo session from changing a real store's menu", () => {
    expect(screen()).toMatch(/isDemo/);
    expect(screen()).toMatch(/DEMO_READONLY_MESSAGE/);
  });

  it("puts the storefront back in step after a change", () => {
    expect(screen()).toMatch(/notifyMenuRevalidate/);
  });

  it("restores the switch when the write fails", () => {
    // Optimistic and silent is the worst pair: the owner walks away believing
    // a branch stopped selling a dish it is still selling.
    expect(screen()).toMatch(/catch/);
    expect(screen()).toMatch(/Alert\.alert/);
  });

  it("names a dish the whole store has switched off rather than offering dead switches", () => {
    expect(screen()).toMatch(/isOffStoreWide/);
  });
});

describe("branch products management", () => {
  it("adds a product through the shared editor in create mode", () => {
    expect(screen()).toMatch(/NEW_PRODUCT_ID/);
    expect(screen()).toMatch(/productHref/);
  });

  it("edits a product through that same editor rather than a second form", () => {
    // A second product form here would drift from the one on the Products tab
    // — different validation, different legacy-column handling, same table.
    expect(screen()).toMatch(/productHref\(row\.product\.id\)/);
    expect(readCode("app", "(main)", "branch-menu.tsx")).not.toMatch(
      /createProduct|updateProduct|deleteProduct/,
    );
  });

  it("keeps editing and the branch switches on separate targets", () => {
    // One row does two jobs. If opening the editor and expanding the branches
    // shared a tap target, every attempt to switch a branch off would leave the
    // screen instead.
    expect(screen()).toMatch(/setExpandedId/);
    expect(screen()).toMatch(/accessibilityLabel=\{`Edit \$\{row\.product\.name\}`\}/);
  });

  it("blocks the demo session from creating a product", () => {
    expect(screen()).toMatch(/const handleCreate = [\s\S]{0,120}isDemo/);
  });

  it("reloads when the screen comes back into focus", () => {
    // Without this a product added or renamed in the editor returns to a list
    // that still shows the old menu, and the owner adds it twice.
    expect(screen()).toMatch(/useFocusEffect/);
  });

  it("filters through the shared rule rather than beside the JSX", () => {
    expect(screen()).toMatch(/filterBranchProducts/);
    expect(screen()).toMatch(/listCategories/);
  });
});
