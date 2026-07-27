/**
 * Guardrails for the merchant app's Inventory screen.
 *
 * Jest here only runs pure-logic roots (lib/, theme/), so — like the other
 * mount guardrails in this directory — this asserts on the screen sources
 * rather than rendering them. What it locks down is the wiring that a unit test
 * of the pure modules cannot see: that the tab exists at all, that the screen
 * gates on the tenant, and that it defers every judgement about stock to the
 * shared pure rules instead of re-deriving them next to the JSX.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("inventory tab registration", () => {
  const layout = read("app", "(main)", "_layout.tsx");

  it("registers the inventory route as a tab", () => {
    expect(layout).toMatch(/name="inventory"/);
  });

  it("gates the tab through the workspace and permission check like every other tab", () => {
    // Without show(), the tab would appear in every view and for staff who
    // hold no menu permission.
    expect(layout).toMatch(/href: show\("inventory"\)/);
  });
});

describe("inventory screen", () => {
  const screen = read("app", "(main)", "inventory.tsx");

  it("loads the shelf through the shared read rather than querying Supabase inline", () => {
    expect(screen).toMatch(/loadInventoryStock/);
    expect(screen).not.toMatch(/from\("inventory_items"\)/);
  });

  it("waits for a tenant before loading", () => {
    // The auth store starts empty; loading on a cold mount would query for
    // every tenant at once.
    expect(screen).toMatch(/if \(!tenantId\) return/);
  });

  it("derives every level from the shared rules, never beside the JSX", () => {
    // A screen that compared current_qty to reorder_level itself would be a
    // second opinion on "is this low?" — the one thing the pure core exists
    // to prevent.
    expect(screen).not.toMatch(/reorder_level/);
    expect(screen).toMatch(/filterStockViews/);
    expect(screen).toMatch(/summarizeStock/);
  });

  it("lets the merchant pull the shelf down to recount it", () => {
    expect(screen).toMatch(/RefreshControl/);
  });

  it("offers a retry when the read fails instead of showing an empty shelf", () => {
    // An empty list and a failed read look identical, and one of them is a lie.
    expect(screen).toMatch(/ErrorState/);
  });

  it("keeps the workspace switcher so the tab is escapable", () => {
    expect(screen).toMatch(/WorkspaceSwitcher/);
  });

  it("lets the merchant search and narrow by level", () => {
    expect(screen).toMatch(/TextInput/);
    expect(screen).toMatch(/setLevelFilter/);
  });
});

describe("inventory stock card", () => {
  const card = read("components", "InventoryStockCard.tsx");

  it("reads each row out as a sentence for assistive technology", () => {
    // The label is built from the shared sentence either way; the card only
    // adds the tap affordance to it once it is pressable.
    expect(card).toMatch(/accessibilityLabel=\{[\s\S]*describeStockView\(/);
  });

  it("offers recording stock as the card's own action", () => {
    // A separate button would leave the merchant aiming at a small target
    // while holding the ingredient — the card is the only thing on it.
    expect(card).toMatch(/onPress/);
    expect(card).toMatch(/accessibilityRole=\{onPress \? "button"/);
  });

  it("draws the fill bar from the shared ratio", () => {
    expect(card).toMatch(/stockFillRatio/);
  });

  it("marks the reorder line on the bar so the bar is readable on its own", () => {
    // The ratio puts the threshold at the midpoint; without the marker the
    // merchant has no way to know where "enough" is.
    expect(card).toMatch(/reorderMark|REORDER_MARK/);
  });
});
