/**
 * The recipe editor's screen-side decisions, kept pure so they can be pinned:
 * what a typed amount means, and which ingredients the "Add" sheet offers.
 */
import {
  buildIngredientChoices,
  formatRecipeQuantity,
  parseQuantityDraft,
} from "./recipe-editor";
import type { IngredientOption, RecipeComponentView } from "./recipe-service";

function option(id: string, name: string, unitLabel = "kg"): IngredientOption {
  return { id, name, stockUnitId: `unit-${unitLabel}`, unitLabel };
}

function line(inventoryItemId: string): RecipeComponentView {
  return {
    id: `comp-${inventoryItemId}`,
    inventoryItemId,
    ingredientName: inventoryItemId,
    quantity: 1,
    unitId: "unit-kg",
    unitLabel: "kg",
  };
}

describe("parseQuantityDraft", () => {
  it("reads a plain decimal", () => {
    expect(parseQuantityDraft("0.25")).toEqual({ ok: true, value: 0.25 });
  });

  it("accepts a decimal comma, the way many phone keypads type it", () => {
    expect(parseQuantityDraft("1,5")).toEqual({ ok: true, value: 1.5 });
  });

  it("ignores surrounding whitespace", () => {
    expect(parseQuantityDraft("  150 ")).toEqual({ ok: true, value: 150 });
  });

  it("refuses blank, zero, negative and non-numeric amounts with a reason", () => {
    for (const draft of ["", "   ", "0", "-2", "abc", "1.2.3"]) {
      const result = parseQuantityDraft(draft);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/more than 0/i);
    }
  });
});

describe("formatRecipeQuantity", () => {
  it("drops trailing zeros a numeric column brings back", () => {
    expect(formatRecipeQuantity(0.25)).toBe("0.25");
    expect(formatRecipeQuantity(150)).toBe("150");
  });

  it("rounds away float noise beyond four decimals", () => {
    expect(formatRecipeQuantity(0.1 + 0.2)).toBe("0.3");
  });
});

describe("buildIngredientChoices", () => {
  const ingredients = [option("a", "Milk", "L"), option("b", "Coffee beans", "g"), option("c", "Sugar")];

  it("marks ingredients already on the recipe instead of hiding them", () => {
    const choices = buildIngredientChoices(ingredients, [line("b")], "");

    expect(choices.map((choice) => [choice.option.id, choice.isAdded])).toEqual([
      ["a", false],
      ["c", false],
      ["b", true],
    ]);
  });

  it("lists the addable ones first, keeping their catalog order", () => {
    const choices = buildIngredientChoices(ingredients, [line("a")], "");

    expect(choices.map((choice) => choice.option.id)).toEqual(["b", "c", "a"]);
  });

  it("narrows by a case-insensitive name search", () => {
    const choices = buildIngredientChoices(ingredients, [], "  COFFEE ");

    expect(choices.map((choice) => choice.option.id)).toEqual(["b"]);
  });

  it("returns nothing when the search matches nothing", () => {
    expect(buildIngredientChoices(ingredients, [], "flour")).toEqual([]);
  });
});
