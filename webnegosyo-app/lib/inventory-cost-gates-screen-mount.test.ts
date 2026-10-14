/**
 * Guardrails for who sees and changes what on the stock screens, now that the
 * old `menu` grant is three:
 * - `menu` keeps the ingredient master (add, rename, unit, archive) and recipes;
 * - `inventory` records stock and sets reorder levels;
 * - `costs` sees and sets what things cost.
 *
 * A cost figure without `costs` is ABSENT — never ₱0, which reads as "free",
 * and never "Not set", which invites the account to set it. The database
 * enforces the writes too; these keep the phone from offering what it refuses.
 *
 * Jest here only runs pure-logic roots, so — like the other mount guardrails —
 * this asserts on the sources rather than rendering them.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("the Stock screen", () => {
  const screen = read("app", "(main)", "inventory.tsx");

  it("hands the hero its peso value only with the costs grant", () => {
    expect(screen).toMatch(/[hH]asPermission\([^)]*"costs"\)/);
    expect(screen).toMatch(/value=\{canSeeCosts \? value : null\}/);
  });

  it("offers a new ingredient only to an account that may add one", () => {
    // Adding an ingredient is the master list, which stayed on `menu`.
    expect(screen).toMatch(/[hH]asPermission\([^)]*"menu"\)/);
    expect(screen).toMatch(/canAddIngredient/);
  });
});

describe("one ingredient", () => {
  const screen = read("app", "(main)", "ingredient", "[ingredientId].tsx");

  it("shows its stock value and unit cost only with the costs grant", () => {
    expect(screen).toMatch(/[hH]asPermission\([^)]*"costs"\)/);
    const gateAt = screen.indexOf("{canSeeCosts && (");
    expect(gateAt).toBeGreaterThan(-1);
    expect(screen.indexOf('label="Stock value"')).toBeGreaterThan(gateAt);
    expect(screen.indexOf("label={`Cost per ${unitLabel}`}")).toBeGreaterThan(gateAt);
  });
});

describe("the ingredient editor", () => {
  const screen = read("app", "(main)", "ingredient", "edit", "[ingredientId].tsx");

  it("reads all three grants", () => {
    expect(screen).toMatch(/[hH]asPermission\([^)]*"menu"\)/);
    expect(screen).toMatch(/[hH]asPermission\([^)]*"inventory"\)/);
    expect(screen).toMatch(/[hH]asPermission\([^)]*"costs"\)/);
  });

  it("shows the cost field only with the costs grant", () => {
    const gateAt = screen.indexOf("{canSeeCosts && (");
    expect(gateAt).toBeGreaterThan(-1);
    expect(screen.indexOf("value={draft.unitCost}")).toBeGreaterThan(gateAt);
  });

  it("locks the master fields without menu and the reorder level without inventory", () => {
    expect(screen).toMatch(/editable=\{canEditMaster\}/);
    expect(screen).toMatch(/editable=\{canManageStock\}/);
  });

  it("sends an update holding only what this account may change", () => {
    // A changed price never rides along from an account that cannot see it.
    expect(screen).toMatch(/restrictIngredientUpdate\(/);
  });

  it("refuses to create an ingredient without the menu grant", () => {
    expect(screen).toMatch(/isNew && !canEditMaster/);
  });

  it("asks for opening stock only from an account that may record stock", () => {
    expect(screen).toMatch(/isNew && canManageStock/);
  });
});

describe("a product's cost and profit", () => {
  const screen = read("app", "(main)", "product", "[productId].tsx");

  it("reads and shows the dish cost only with the costs grant", () => {
    expect(screen).toMatch(/[hH]asPermission\([^)]*"costs"\)/);
    expect(screen).toMatch(/canSeeCosts \? \{ menuItemId: productId \} : "skip"/);
    const gateAt = screen.indexOf("{canSeeCosts && !isNew && (");
    expect(gateAt).toBeGreaterThan(-1);
    expect(screen.indexOf('title="Cost & Profit"')).toBeGreaterThan(gateAt);
  });
});
