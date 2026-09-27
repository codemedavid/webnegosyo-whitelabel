import { parseLineModifiers, splitAddonLabel } from "./modifiers";
import type { CatalogProduct, SalesLine } from "./types";
import type { ModifierGroup } from "../modifier-groups";

function group(
  id: string,
  name: string,
  maxSelect: number | null,
  options: readonly [string, number][]
): ModifierGroup {
  return {
    id,
    name,
    display_order: 0,
    min_select: 0,
    max_select: maxSelect,
    options: options.map(([optionName, price], index) => ({
      id: `${id}-${index}`,
      name: optionName,
      price_modifier: price,
      display_order: index,
    })),
  };
}

const BURGER: CatalogProduct = {
  id: "burger",
  name: "Burger",
  groups: [
    group("size", "Size", 1, [["Regular", 0], ["Large", 20]]),
    group("spice", "Spice", 1, [["Mild", 0], ["Hot", 0]]),
    group("extras", "Add-ons", null, [["Extra Cheese", 15], ["Bacon", 20]]),
  ],
};

function line(overrides: Partial<SalesLine>): SalesLine {
  return {
    orderId: "o1",
    createdAtMs: 0,
    menuItemId: "burger",
    menuItemName: "Burger",
    quantity: 1,
    subtotal: 100,
    ...overrides,
  };
}

describe("splitAddonLabel", () => {
  it("reads the per-unit quantity a web checkout appends to the name", () => {
    expect(splitAddonLabel("Extra Cheese ×2")).toEqual({ name: "Extra Cheese", quantity: 2 });
    expect(splitAddonLabel("Extra Cheese x3")).toEqual({ name: "Extra Cheese", quantity: 3 });
    expect(splitAddonLabel("Extra Cheese × 2")).toEqual({ name: "Extra Cheese", quantity: 2 });
  });

  it("leaves a plain name alone", () => {
    expect(splitAddonLabel("Bacon")).toEqual({ name: "Bacon", quantity: 1 });
    // A name that merely ends in a letter x is not a quantity.
    expect(splitAddonLabel("Fox")).toEqual({ name: "Fox", quantity: 1 });
  });
});

describe("parseLineModifiers", () => {
  it("reads a register line, where add-ons ride in the selections with their price", () => {
    // Arrange
    const sold = line({
      variationSelections: [
        { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
        { typeName: "Add-ons", optionName: "Extra Cheese", priceAdjustment: 15 },
      ],
    });

    // Act
    const modifiers = parseLineModifiers(sold, BURGER);

    // Assert
    expect(modifiers).toEqual([
      { kind: "variation", groupName: "Size", name: "Large", perUnit: 1, unitPrice: 20, priceSource: "recorded" },
      { kind: "addon", groupName: "Add-ons", name: "Extra Cheese", perUnit: 1, unitPrice: 15, priceSource: "recorded" },
    ]);
  });

  it("reads a web line — joined variation names, add-on labels, no prices stored", () => {
    // Arrange
    const sold = line({ variation: "Large, Hot", addons: [{ name: "Extra Cheese ×2", price: 0 }, { name: "Bacon", price: 0 }] });

    // Act
    const modifiers = parseLineModifiers(sold, BURGER);

    // Assert
    expect(modifiers).toEqual([
      { kind: "variation", groupName: "Size", name: "Large", perUnit: 1, unitPrice: 20, priceSource: "menu" },
      { kind: "variation", groupName: "Spice", name: "Hot", perUnit: 1, unitPrice: 0, priceSource: "menu" },
      { kind: "addon", groupName: "Add-ons", name: "Extra Cheese", perUnit: 2, unitPrice: 15, priceSource: "menu" },
      { kind: "addon", groupName: "Add-ons", name: "Bacon", perUnit: 1, unitPrice: 20, priceSource: "menu" },
    ]);
  });

  it("keeps a variation whose own name contains a comma in one piece", () => {
    // Arrange
    const product: CatalogProduct = {
      id: "meal",
      name: "Meal",
      groups: [group("set", "Set", 1, [["Set B (w/ Juice, Ice Cream)", 10]])],
    };

    // Act
    const modifiers = parseLineModifiers(line({ variation: "Set B (w/ Juice, Ice Cream)" }), product);

    // Assert
    expect(modifiers).toHaveLength(1);
    expect(modifiers[0]).toMatchObject({ kind: "variation", groupName: "Set", name: "Set B (w/ Juice, Ice Cream)" });
  });

  it("puts a QR line's generic 'Variation' back in its real group", () => {
    const modifiers = parseLineModifiers(
      line({ variationSelections: [{ typeName: "Variation", optionName: "Large", priceAdjustment: 20 }] }),
      BURGER
    );

    expect(modifiers[0]).toMatchObject({ kind: "variation", groupName: "Size", name: "Large" });
  });

  it("matches option names without caring about case or stray spaces", () => {
    const modifiers = parseLineModifiers(line({ variation: " large " }), BURGER);

    expect(modifiers[0]).toMatchObject({ groupName: "Size", name: "Large" });
  });

  it("uses a price stored on the add-on when the backend kept one", () => {
    const modifiers = parseLineModifiers(
      line({ addons: [{ name: "Bacon", price: 25, quantity: 1 }] }),
      BURGER
    );

    expect(modifiers[0]).toMatchObject({ kind: "addon", unitPrice: 25, priceSource: "recorded" });
  });

  it("still counts options of a product no longer on the menu", () => {
    // Arrange
    const sold = line({
      variation: "Large",
      addons: [{ name: "Rice", price: 0 }],
      variationSelections: undefined,
    });

    // Act
    const modifiers = parseLineModifiers(sold, undefined);

    // Assert
    expect(modifiers).toEqual([
      { kind: "variation", groupName: "Options", name: "Large", perUnit: 1, unitPrice: null, priceSource: "unknown" },
      { kind: "addon", groupName: "Add-ons", name: "Rice", perUnit: 1, unitPrice: null, priceSource: "unknown" },
    ]);
  });

  it("guesses the kind from the group name when the menu cannot say", () => {
    const modifiers = parseLineModifiers(
      line({
        variationSelections: [
          { typeName: "Size", optionName: "Grande", priceAdjustment: 0 },
          { typeName: "Extras", optionName: "Pearls", priceAdjustment: 10 },
        ],
      }),
      undefined
    );

    expect(modifiers.map((m) => m.kind)).toEqual(["variation", "addon"]);
  });

  it("counts a zero-priced add-on as free, not as unpriced", () => {
    const product: CatalogProduct = {
      id: "tea",
      name: "Tea",
      groups: [group("x", "Extras", null, [["Less ice", 0]])],
    };

    const modifiers = parseLineModifiers(line({ addons: [{ name: "Less ice", price: 0 }] }), product);

    expect(modifiers[0]).toMatchObject({ unitPrice: 0, priceSource: "menu" });
  });

  it("treats a REQUIRED pick-several group as the item's choice, not an add-on", () => {
    // Arrange — how an eat-all-you-can store sells its sets: a ₱0.01 item whose
    // required group carries the real price.
    const unli: CatalogProduct = {
      id: "unli",
      name: "Unli Pork",
      groups: [{ ...group("set", "Unli Set Pork", 100, [["Unli Pork", 299], ["Unli Pork Kid", 149.5]]), min_select: 1 }],
    };
    const sold = line({
      menuItemId: "unli",
      variationSelections: [{ typeName: "Unli Set Pork", optionName: "Unli Pork", priceAdjustment: 299 }],
    });

    // Act
    const [modifier] = parseLineModifiers(sold, unli);

    // Assert
    expect(modifier).toMatchObject({ kind: "variation", groupName: "Unli Set Pork", name: "Unli Pork" });
  });

  it("classifies a web add-on label from a required group the same way", () => {
    const meal: CatalogProduct = {
      id: "meal",
      name: "Meal",
      groups: [{ ...group("side", "Choose a side", 2, [["Fries", 0], ["Salad", 0]]), min_select: 1 }],
    };

    const [modifier] = parseLineModifiers(line({ addons: [{ name: "Fries", price: 0 }] }), meal);

    expect(modifier).toMatchObject({ kind: "variation", groupName: "Choose a side" });
  });

  it("counts an add-on once when a mixed line lists it in both places", () => {
    // Edited and QR orders split options across the two fields; they should
    // never overlap, but if one ever does the add-on is still one add-on.
    const modifiers = parseLineModifiers(
      line({
        variationSelections: [
          { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
          { typeName: "Add-ons", optionName: "Bacon", priceAdjustment: 20 },
        ],
        addons: [{ name: "bacon", price: 0 }, { name: "Extra Cheese", price: 0 }],
      }),
      BURGER
    );

    expect(modifiers.filter((m) => m.kind === "addon").map((m) => m.name)).toEqual(["Bacon", "Extra Cheese"]);
  });

  it("returns nothing for a plain line", () => {
    expect(parseLineModifiers(line({}), BURGER)).toEqual([]);
  });
});
