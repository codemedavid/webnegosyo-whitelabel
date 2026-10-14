import { canConvertUnits, compatibleRecipeUnits, recipeLineProblem, type RuleUnit } from "./recipe-line-rules";

const G: RuleUnit = { id: "g", abbreviation: "g", dimension: "weight" };
const KG: RuleUnit = { id: "kg", abbreviation: "kg", dimension: "weight" };
const ML: RuleUnit = { id: "ml", abbreviation: "ml", dimension: "volume" };
const PC: RuleUnit = { id: "pc", abbreviation: "pc", dimension: "count" };
const UNITS = [G, KG, ML, PC];

describe("canConvertUnits", () => {
  it("converts within a dimension and between weight and volume (1 g = 1 ml)", () => {
    expect(canConvertUnits(G, KG)).toBe(true);
    expect(canConvertUnits(G, ML)).toBe(true);
    expect(canConvertUnits(ML, KG)).toBe(true);
  });

  it("never converts a count to a weight or volume", () => {
    expect(canConvertUnits(PC, G)).toBe(false);
    expect(canConvertUnits(ML, PC)).toBe(false);
  });
});

describe("recipeLineProblem", () => {
  const egg = { name: "Egg", stockUnitId: "pc" };
  const milk = { name: "Milk", stockUnitId: "ml" };

  it.each([0, -2, Number.NaN])("refuses quantity %p", (quantity) => {
    expect(recipeLineProblem({ quantity, unitId: "pc" }, egg, UNITS)).toMatch(/more than 0/);
  });

  it("refuses grams of an ingredient stocked by the piece", () => {
    expect(recipeLineProblem({ quantity: 50, unitId: "g" }, egg, UNITS)).toMatch(/stocked in pc.*can't be measured in g/);
  });

  it("accepts grams of milk stocked in millilitres", () => {
    expect(recipeLineProblem({ quantity: 200, unitId: "g" }, milk, UNITS)).toBeNull();
  });

  it("asks for a unit when the line's unit is not in the catalogue", () => {
    expect(recipeLineProblem({ quantity: 1, unitId: "gone" }, egg, UNITS)).toMatch(/Choose a unit/);
  });

  it("only checks the quantity when the ingredient's stock unit is unknown", () => {
    expect(recipeLineProblem({ quantity: 1, unitId: "g" }, { name: "X", stockUnitId: null }, UNITS)).toBeNull();
  });
});

describe("compatibleRecipeUnits", () => {
  it("offers only convertible units for the picker", () => {
    expect(compatibleRecipeUnits("pc", UNITS).map((u) => u.id)).toEqual(["pc"]);
    expect(compatibleRecipeUnits("ml", UNITS).map((u) => u.id)).toEqual(["g", "kg", "ml"]);
  });

  it("offers every unit when the stock unit is unknown", () => {
    expect(compatibleRecipeUnits(null, UNITS)).toHaveLength(4);
  });
});
