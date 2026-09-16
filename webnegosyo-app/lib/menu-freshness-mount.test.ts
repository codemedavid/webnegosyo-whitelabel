/**
 * Guardrails: the register and the product list must never go stale.
 *
 * Both are TAB screens. A tab mounts once and is never unmounted again, so a
 * `useEffect` that reads the menu on mount reads it exactly once per launch —
 * and a dish added afterwards (here, in the editor, or on the web admin) is
 * invisible until the merchant force-quits the app. That is the defect this
 * locks out: both screens must read through the shared cache, which a save
 * invalidates, and must re-read when the tab is focused.
 *
 * Jest here only runs pure roots, so — as with the other mount guardrails in
 * this directory — this asserts on the source.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("register screen menu freshness", () => {
  const screen = read("app", "(main)", "pos.tsx");

  it("reads its products and categories from the shared cache", () => {
    expect(screen).toMatch(/usePosCatalog\(/);
  });

  it("reads its order types and their prices from the shared cache", () => {
    expect(screen).toMatch(/useRegisterPricing\(/);
  });

  it("does not load the menu itself, which a mounted tab would do only once", () => {
    expect(screen).not.toMatch(/listProducts\(/);
    expect(screen).not.toMatch(/listCategories\(/);
    expect(screen).not.toMatch(/listRegisterOrderTypes\(/);
    expect(screen).not.toMatch(/listOrderTypeItemPrices\(/);
  });

  it("re-reads the menu when the cashier comes back to the tab", () => {
    expect(screen).toMatch(/useRefetchOnScreenFocus\(/);
  });
});

describe("product management screen freshness", () => {
  const screen = read("app", "(main)", "product-management.tsx");

  it("reads the products and categories from the shared cache", () => {
    expect(screen).toMatch(/useProducts\(/);
    expect(screen).toMatch(/useCategories\(/);
  });

  it("does not load them itself", () => {
    expect(screen).not.toMatch(/listProducts\(/);
    expect(screen).not.toMatch(/listCategories\(/);
  });

  it("re-reads when the owner comes back to the tab", () => {
    expect(screen).toMatch(/useRefetchOnScreenFocus\(/);
  });

  it("awaits the refetch on pull-to-refresh instead of a timer", () => {
    expect(screen).toMatch(/refreshWithMinSpinner\(/);
  });
});

describe("product editor", () => {
  const screen = read("app", "(main)", "product", "[productId].tsx");

  it("invalidates the catalog after every write, so the other screens re-read", () => {
    expect(screen).toMatch(/invalidateMenuCatalog\(/);
  });
});
