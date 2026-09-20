/**
 * Guardrails for the merchant app's category management screens.
 *
 * Jest here only runs pure-logic roots, so — like the other mount guardrails
 * beside it — this asserts on the screen sources rather than rendering them.
 * What it locks down is the wiring no unit test of the pure module can see:
 * that the screens are registered and reachable, that a cashier cannot rename
 * the menu, that a write reaches the shared catalog cache and the public menu's
 * ISR cache, and that the editor saves through the service that touches only
 * the five columns this app owns.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { getWorkspace, workspaceForTab } from "./workspaces";
import { isTabAllowed } from "./staff-permissions";
import { SETUP_TABS } from "./tab-visibility";
import { MANAGE_SECTIONS, hubTabs } from "./hubs";
import { tabPresentation } from "./workspace-presentation";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("categories tab registration", () => {
  it("belongs to the Products view, beside the rest of the menu setup", () => {
    expect(workspaceForTab("categories")).toBe("products");
    expect(getWorkspace("products").tabs).toContain("categories");
  });

  it("is listed in the Manage hub, which is the only way in", () => {
    expect(SETUP_TABS).toContain("categories");
    expect(hubTabs(MANAGE_SECTIONS)).toContain("categories");
  });

  it("presents itself the way every other screen does", () => {
    const presentation = tabPresentation("categories");

    expect(presentation.label).toBeTruthy();
    expect(presentation.hint).toBeTruthy();
  });

  it("has a route file, so registering it cannot break the tab bar", () => {
    expect(existsSync(join(ROOT, "app", "(main)", "categories.tsx"))).toBe(true);
  });

  it("registers the editor as a routable screen that is not itself a tab", () => {
    const layout = read("app", "(main)", "_layout.tsx");

    expect(existsSync(join(ROOT, "app", "(main)", "category", "[categoryId].tsx"))).toBe(
      true,
    );
    expect(layout).toMatch(/name="category\/\[categoryId\]"[\s\S]{0,120}href: null/);
  });
});

describe("categories permission", () => {
  const cashier = { role: "admin", isOwner: false, permissions: ["pos", "orders"] };
  const menuStaff = {
    role: "admin",
    isOwner: false,
    permissions: ["pos", "orders", "menu"],
  };

  it("keeps a cashier out: renaming a category rewrites the public menu", () => {
    // An unmapped tab defaults to allowed, which is what this pins.
    expect(isTabAllowed(cashier, "categories")).toBe(false);
  });

  it("lets a staff member granted the menu in", () => {
    expect(isTabAllowed(menuStaff, "categories")).toBe(true);
  });
});

describe("categories list screen", () => {
  const screen = () => read("app", "(main)", "categories.tsx");

  it("reads through the shared catalog cache, not its own query", () => {
    expect(screen()).toMatch(/useCategories\(/);
    expect(screen()).not.toMatch(/from\("categories"\)/);
  });

  it("offers a retry when the read fails instead of an empty list", () => {
    expect(screen()).toMatch(/ErrorState/);
  });

  it("lets the merchant pull the list down to refresh it", () => {
    expect(screen()).toMatch(/RefreshControl/);
  });

  it("arranges through the shared pure move rather than beside the JSX", () => {
    expect(screen()).toMatch(/moveCategory/);
    expect(screen()).toMatch(/reorderCategories/);
  });

  it("re-reads the catalog after arranging, so the product list agrees", () => {
    expect(screen()).toMatch(/invalidate/);
  });

  it("tells the storefront to rebuild its menu after a change", () => {
    // The public menu is ISR-cached; without this a reorder made on a phone
    // is invisible to customers until the TTL runs out.
    expect(screen()).toMatch(/notifyMenuRevalidate/);
  });

  it("blocks the demo session from rearranging a real store's menu", () => {
    expect(screen()).toMatch(/isDemo/);
    expect(screen()).toMatch(/DEMO_READONLY_MESSAGE/);
  });

  it("draws each category's own icon rather than a generic row", () => {
    expect(screen()).toMatch(/CategoryIcon/);
  });
});

describe("category editor screen", () => {
  const screen = () => read("app", "(main)", "category", "[categoryId].tsx");

  it("derives its form from the shared builder, so Add never shows the last edit", () => {
    expect(screen()).toMatch(/buildCategoryEditorState/);
  });

  it("validates through the shared rules before saving", () => {
    expect(screen()).toMatch(/validateCategoryInput/);
  });

  it("saves through the service that writes only this app's own columns", () => {
    // A whole-row save would reset `order`, `display_layout`, `card_template`
    // and `default_addons` — the columns the web Branding Studio owns.
    expect(screen()).toMatch(/updateCategory\(/);
    expect(screen()).not.toMatch(/from\("categories"\)/);
  });

  it("picks the icon from the curated library rather than free text", () => {
    expect(screen()).toMatch(/CategoryIconPicker/);
  });

  it("warns how many dishes a delete would leave uncategorised", () => {
    expect(screen()).toMatch(/countProductsIn/);
  });

  it.each(["handleSave", "handleDelete"])("blocks %s in the demo session", (handler) => {
    expect(screen()).toMatch(
      new RegExp(`const ${handler} = [\\s\\S]{0,80}blockedByDemo\\(\\)`),
    );
  });

  it("waits for a tenant before loading or saving", () => {
    expect(screen()).toMatch(/if \(!tenantId\) return/);
  });

  it("navigates with goTo after creating, never router.replace", () => {
    expect(screen()).toMatch(/goTo\(router,/);
  });
});
