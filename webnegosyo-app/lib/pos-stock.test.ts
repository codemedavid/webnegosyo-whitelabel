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
