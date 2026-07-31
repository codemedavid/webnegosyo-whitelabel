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

describe("inventory screen — the branch the merchant is standing in", () => {
  const screen = read("app", "(main)", "inventory.tsx");

  it("scopes the shelf to the branch through the shared hook", () => {
    // Without this the screen shows inventory_items.current_qty, which is the
    // chain roll-up: a manager at South reads the whole store's flour.
    expect(screen).toMatch(/useBranchScope/);
  });

  it("passes that branch into the read rather than filtering after it", () => {
    // Filtering on the phone cannot work: the roll-up is a single scalar, so
    // there is nothing to filter. The branch has to reach the query.
    expect(screen).toMatch(/loadInventoryStock\(\s*tenantId,\s*\w+/);
  });

  it("reloads the shelf when the merchant drills into another branch", () => {
    // useBranchScope composes the account scope with the portfolio drill-down.
    // A load that did not depend on it would leave the previous branch's
    // quantities on screen under the new branch's name.
    expect(screen).toMatch(/\[tenantId,\s*\w*[Oo]utletId\]/);
  });
});

describe("stock movement sheet — writing to the shelf being read", () => {
  const sheet = read("components", "StockMovementSheet.tsx");

  it("records the movement against the branch whose shelf is on screen", () => {
    // The API resolves and vets the branch server-side but takes it from the
    // body. Without this the merchant sees South's zero, records a delivery,
    // and it lands in the unbranched pool -- so the shelf they are looking at
    // still reads zero and the stock is somewhere they did not put it.
    expect(sheet).toMatch(/outletId/);
  });
});
