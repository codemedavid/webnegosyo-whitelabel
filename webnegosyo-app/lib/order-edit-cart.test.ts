/**
 * Loading a placed order back into the register cart, and writing it out again.
 *
 * This is the riskiest translation in the edit flow. Two different writers
 * produce `order_items` with DIFFERENT meanings for the `price` column:
 *
 *   - the register (`lib/pos-order.ts:toOrderItem`) writes the item's BASE
 *     price and folds the modifiers into `subtotal` only;
 *   - web checkout (`src/lib/cart-utils.ts:calculateCartItemUnitPrice`) writes
 *     the fully-loaded UNIT price, modifiers and add-ons included.
 *
 * The one invariant both honour is `subtotal === unitPrice × quantity`, so
 * hydration derives the unit price from the subtotal and never trusts `price`.
 * Getting this wrong silently reprices real customer orders, so the round-trip
 * is pinned here before any of it is written.
 */

import type { ModifierGroup } from "./modifier-groups";
import type { OrderItemDto } from "./backends/supabase-orders";
import { hydratePosCart, posCartToOrderItems } from "./order-edit-cart";

const SIZE_GROUP: ModifierGroup = {
  id: "grp-size",
  name: "Size",
  display_order: 0,
  min_select: 1,
  max_select: 1,
  options: [
    { id: "opt-small", name: "Small", price_modifier: 0, display_order: 0 },
    { id: "opt-large", name: "Large", price_modifier: 20, display_order: 1 },
  ],
};

const EXTRAS_GROUP: ModifierGroup = {
  id: "grp-extras",
  name: "Extras",
  display_order: 1,
  min_select: 0,
  max_select: null,
  options: [
    { id: "opt-shot", name: "Extra Shot", price_modifier: 30, display_order: 0 },
    { id: "opt-pearls", name: "Pearls", price_modifier: 15, display_order: 1 },
  ],
};

const CATALOG = { "item-latte": [SIZE_GROUP, EXTRAS_GROUP] };

function orderItem(overrides: Partial<OrderItemDto> = {}): OrderItemDto {
  return {
    _id: "oi-1",
    orderId: "ord-1",
    menuItemId: "item-latte",
    menuItemName: "Latte",
    quantity: 1,
    price: 100,
    subtotal: 100,
    addons: [],
    ...overrides,
  };
}

describe("hydratePosCart", () => {
  it("loads a plain item with no modifiers", () => {
    const { lines } = hydratePosCart([orderItem({ quantity: 2, subtotal: 200 })], CATALOG);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      menuItemId: "item-latte",
      name: "Latte",
      quantity: 2,
      basePrice: 100,
      unitPrice: 100,
      subtotal: 200,
      selections: [],
    });
  });

  it("resolves variation selections back to live catalog option ids", () => {
    // The register needs real ids so ModifierSheet can show the option as
    // selected and so lineKey stacks identical configurations.
    const { lines } = hydratePosCart(
      [
        orderItem({
          price: 100,
          subtotal: 120,
          variationSelections: [
            { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
          ],
        }),
      ],
      CATALOG,
    );

    expect(lines[0].selections).toEqual([
      {
        groupId: "grp-size",
        groupName: "Size",
        optionId: "opt-large",
        optionName: "Large",
        priceModifier: 20,
      },
    ]);
  });

  it("resolves add-ons into selections too", () => {
    const { lines } = hydratePosCart(
      [orderItem({ price: 100, subtotal: 130, addons: [{ name: "Extra Shot", price: 30 }] })],
      CATALOG,
    );

    expect(lines[0].selections).toEqual([
      {
        groupId: "grp-extras",
        groupName: "Extras",
        optionId: "opt-shot",
        optionName: "Extra Shot",
        priceModifier: 30,
      },
    ]);
  });

  it("derives the unit price from the subtotal, not the price column", () => {
    // A register-written item: price is the BASE (100), subtotal carries the
    // +20 Large modifier. Trusting `price` here would lose the ₱20.
    const { lines } = hydratePosCart(
      [
        orderItem({
          quantity: 2,
          price: 100,
          subtotal: 240,
          variationSelections: [
            { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
          ],
        }),
      ],
      CATALOG,
    );

    expect(lines[0].unitPrice).toBe(120);
    expect(lines[0].basePrice).toBe(100);
  });

  it("derives the same base price from a web-written item", () => {
    // Identical order, written by web checkout: price is the LOADED unit price.
    const { lines } = hydratePosCart(
      [
        orderItem({
          quantity: 2,
          price: 120,
          subtotal: 240,
          variationSelections: [
            { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
          ],
        }),
      ],
      CATALOG,
    );

    expect(lines[0].unitPrice).toBe(120);
    expect(lines[0].basePrice).toBe(100);
  });

  it("keeps the kitchen note as the line note so notes never merge", () => {
    const { lines } = hydratePosCart(
      [orderItem({ specialInstructions: "No sugar" })],
      CATALOG,
    );

    expect(lines[0].note).toBe("No sugar");
  });

  it("gives lines distinct keys when their configurations differ", () => {
    const { lines } = hydratePosCart(
      [
        orderItem({ _id: "oi-1", subtotal: 100 }),
        orderItem({
          _id: "oi-2",
          subtotal: 120,
          variationSelections: [
            { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
          ],
        }),
      ],
      CATALOG,
    );

    expect(lines).toHaveLength(2);
    expect(lines[0].key).not.toBe(lines[1].key);
  });

  it("stacks two identically-configured items into one line", () => {
    const { lines } = hydratePosCart(
      [
        orderItem({ _id: "oi-1", quantity: 1, subtotal: 100 }),
        orderItem({ _id: "oi-2", quantity: 2, subtotal: 200 }),
      ],
      CATALOG,
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
    expect(lines[0].subtotal).toBe(300);
  });

  it("reports an option that no longer exists on the live menu", () => {
    // The item was sold with a modifier the merchant has since deleted. It must
    // surface, not vanish — silently dropping it would reprice the order.
    const { lines, unresolved } = hydratePosCart(
      [
        orderItem({
          subtotal: 110,
          variationSelections: [
            { typeName: "Size", optionName: "Venti", priceAdjustment: 10 },
          ],
        }),
      ],
      CATALOG,
    );

    expect(unresolved).toEqual([
      { menuItemName: "Latte", groupName: "Size", optionName: "Venti" },
    ]);
    // The line is still priced correctly even though the option is orphaned.
    expect(lines[0].unitPrice).toBe(110);
  });

  it("reports an item whose menu entry is gone entirely", () => {
    const { lines, unresolved } = hydratePosCart(
      [orderItem({ menuItemId: "item-deleted", menuItemName: "Retired Cake" })],
      CATALOG,
    );

    expect(lines).toHaveLength(1);
    expect(unresolved).toContainEqual(
      expect.objectContaining({ menuItemName: "Retired Cake" }),
    );
  });

  it("returns an empty cart for an order with no items", () => {
    expect(hydratePosCart([], CATALOG)).toEqual({ lines: [], unresolved: [] });
  });

  it("does not divide by zero on a corrupt zero-quantity item", () => {
    const { lines } = hydratePosCart(
      [orderItem({ quantity: 0, subtotal: 0 })],
      CATALOG,
    );

    expect(lines).toEqual([]);
  });
});

describe("posCartToOrderItems", () => {
  it("writes the loaded unit price so subtotal === price × quantity", () => {
    // The revise path standardises on the web convention, because the server's
    // price revalidation asserts exactly this identity.
    const { lines } = hydratePosCart(
      [
        orderItem({
          quantity: 2,
          price: 100,
          subtotal: 240,
          variationSelections: [
            { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
          ],
        }),
      ],
      CATALOG,
    );

    const [item] = posCartToOrderItems(lines);

    expect(item.price).toBe(120);
    expect(item.subtotal).toBe(240);
    expect(item.subtotal).toBe(item.price * item.quantity);
  });

  it("round-trips a fully-configured order without losing anything", () => {
    const original = [
      orderItem({
        quantity: 2,
        price: 135,
        subtotal: 270,
        specialInstructions: "Extra hot",
        variationSelections: [
          { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
        ],
        addons: [{ name: "Pearls", price: 15 }],
      }),
    ];

    const { lines } = hydratePosCart(original, CATALOG);
    const [item] = posCartToOrderItems(lines);

    expect(item).toEqual({
      menuItemId: "item-latte",
      menuItemName: "Latte",
      quantity: 2,
      price: 135,
      subtotal: 270,
      specialInstructions: "Extra hot",
      variationSelections: [
        { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
      ],
      addons: [{ name: "Pearls", price: 15 }],
    });
  });

  it("omits optional fields rather than writing undefined into the row", () => {
    const { lines } = hydratePosCart([orderItem()], CATALOG);

    expect(posCartToOrderItems(lines)[0]).toEqual({
      menuItemId: "item-latte",
      menuItemName: "Latte",
      quantity: 1,
      price: 100,
      subtotal: 100,
    });
  });
});
