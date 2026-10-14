import { buildPosStockItems } from "./pos-stock";
import { addLine, type PosCartLine } from "./pos-cart";

const largeLatte = {
  menuItemId: "m-latte",
  name: "Latte",
  basePrice: 120,
  quantity: 2,
  selections: [
    {
      groupId: "g-size",
      groupName: "Size",
      optionId: "o-large",
      optionName: "Large",
      priceModifier: 20,
    },
    {
      groupId: "g-milk",
      groupName: "Milk",
      optionId: "o-oat",
      optionName: "Oat",
      priceModifier: 15,
    },
  ],
};

const plainCroissant = {
  menuItemId: "m-croissant",
  name: "Croissant",
  basePrice: 87.5,
  quantity: 1,
  selections: [],
  note: "warmed",
};

describe("buildPosStockItems", () => {
  it("carries the menu item id and quantity of every line", () => {
    // Arrange
    const cart: PosCartLine[] = addLine(addLine([], largeLatte), plainCroissant);

    // Act
    const items = buildPosStockItems(cart);

    // Assert
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ menuItemId: "m-latte", quantity: 2 });
    expect(items[1]).toMatchObject({ menuItemId: "m-croissant", quantity: 1 });
  });

  it("carries every selected option id so option recipes are spent", () => {
    // Arrange
    const cart: PosCartLine[] = addLine([], largeLatte);

    // Act
    const items = buildPosStockItems(cart);

    // Assert
    expect(items[0].optionIds).toEqual(["o-large", "o-oat"]);
  });

  it("carries the selected ids as addon ids too, so addon recipes are spent", () => {
    // The register's unified selection model cannot tell an add-on-group
    // option from a variation option, and ids are unique per option — so the
    // same set feeds the platform's addon recipe bucket, where a recipe
    // attached to a legacy addon finally matches. Without this, a counter
    // sale never depleted any addon recipe.
    const cart: PosCartLine[] = addLine([], largeLatte);

    const items = buildPosStockItems(cart);

    expect(items[0].addonIds).toEqual(["o-large", "o-oat"]);
  });

  it("sends an empty addon list for a line with no modifiers", () => {
    const cart: PosCartLine[] = addLine([], plainCroissant);

    const items = buildPosStockItems(cart);

    expect(items[0].addonIds).toEqual([]);
  });

  it("sends an empty option list for a line with no modifiers", () => {
    // Arrange
    const cart: PosCartLine[] = addLine([], plainCroissant);

    // Act
    const items = buildPosStockItems(cart);

    // Assert
    expect(items[0].optionIds).toEqual([]);
  });

  it("keeps two configurations of the same item as separate lines", () => {
    // Arrange — same drink, different size. They must not be merged: each
    // configuration spends a different set of ingredients.
    const small = { ...largeLatte, quantity: 1, selections: [] };
    const cart: PosCartLine[] = addLine(addLine([], largeLatte), small);

    // Act
    const items = buildPosStockItems(cart);

    // Assert
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.optionIds)).toEqual([["o-large", "o-oat"], []]);
  });

  it("returns nothing for an empty cart", () => {
    // Arrange / Act
    const items = buildPosStockItems([]);

    // Assert
    expect(items).toEqual([]);
  });
});

describe("add-on portions", () => {
  it("sends portions beyond one as addonQuantities, keyed by option id", () => {
    const line = {
      menuItemId: "m-side",
      name: "Sides",
      basePrice: 0,
      quantity: 1,
      selections: [
        { groupId: "g", groupName: "Sides", optionId: "o-kimchi", optionName: "Kimchi", priceModifier: 0, portions: 2 },
        { groupId: "g", groupName: "Sides", optionId: "o-egg", optionName: "Egg", priceModifier: 0 },
      ],
    };
    const [item] = buildPosStockItems(addLine([], line));
    expect(item.addonIds).toEqual(["o-kimchi", "o-egg"]);
    expect(item.addonQuantities).toEqual({ "o-kimchi": 2 });
  });

  it("omits addonQuantities entirely when every option is one portion", () => {
    const [item] = buildPosStockItems(addLine([], largeLatte));
    expect(item).not.toHaveProperty("addonQuantities");
  });

  it("clamps a corrupt portion count into the platform's 1..99 range", () => {
    const line = {
      menuItemId: "m",
      name: "x",
      basePrice: 0,
      quantity: 1,
      selections: [{ groupId: "g", groupName: "g", optionId: "o", optionName: "o", priceModifier: 0, portions: 500 }],
    };
    expect(buildPosStockItems(addLine([], line))[0].addonQuantities).toEqual({ o: 99 });
  });
});
