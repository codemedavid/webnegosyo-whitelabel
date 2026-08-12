/**
 * Adding a second round to an order that is already on the table.
 *
 * This is not editing. A cashier correcting a mistake wants the whole bill back
 * on the register so they can change it; a cashier taking "two more beers" wants
 * an EMPTY register, so they ring up only what was just asked for and the food
 * already being cooked is left alone.
 *
 * The two share every piece of arithmetic — the carried delivery fee, the
 * re-priced discount, the balance owed — which is why append is a mode of the
 * edit context rather than a second implementation. What it must not share is
 * the cart: the original lines sit behind the register instead of inside it.
 *
 * Two things this file exists to stop:
 *
 * 1. Appending re-pricing the bill from the new items alone, which would drop
 *    the original food off the customer's total.
 * 2. The kitchen rule barring an edit also barring an append. A restaurant adds
 *    a round precisely WHILE the first one is being cooked; refusing there is
 *    refusing the only moment the feature is for.
 */

import {
  canEnterAppendMode,
  editModeTotals,
  effectiveEditCart,
  enterAppendMode,
  enterEditMode,
} from "./pos-edit-mode";
import { canAppendToOrder } from "./order-edit-guards";
import type { ModifierCatalog } from "./order-edit-cart";
import type { OrderItemDto } from "./backends/supabase-orders";
import type { StaffPermissionHolder } from "./staff-permissions";
import { addLine, type PosCartLine } from "./pos-cart";

const OWNER: StaffPermissionHolder = { role: "admin", isOwner: true, permissions: null };
const EMPTY_CATALOG: ModifierCatalog = {};

function orderItem(overrides: Partial<OrderItemDto> = {}): OrderItemDto {
  return {
    _id: "oi-1",
    orderId: "order-1",
    menuItemId: "item-latte",
    menuItemName: "Latte",
    quantity: 2,
    price: 100,
    subtotal: 200,
    addons: [],
    ...overrides,
  };
}

/** ₱200 of food, ₱50 to deliver it, ₱10 of service charge on top. */
function deliveryOrder() {
  return {
    _id: "order-1",
    total: 260,
    revisionNumber: 3,
    deliveryFee: 50,
    items: [orderItem()],
  };
}

function cartWith(...inputs: { menuItemId: string; name: string; basePrice: number; quantity: number }[]): PosCartLine[] {
  return inputs.reduce<PosCartLine[]>(
    (lines, input) => addLine(lines, { ...input, selections: [] }),
    [],
  );
}

describe("enterAppendMode", () => {
  it("opens an empty register so the cashier rings up only the new round", () => {
    const entered = enterAppendMode(deliveryOrder(), [], EMPTY_CATALOG);

    expect(entered.cart).toEqual([]);
  });

  it("remembers the food already ordered instead of discarding it", () => {
    const entered = enterAppendMode(deliveryOrder(), [], EMPTY_CATALOG);

    expect(entered.context.appendBaseCart).toHaveLength(1);
    expect(entered.context.appendBaseCart[0].subtotal).toBe(200);
  });

  it("marks the context as an append so the screens can tell the two apart", () => {
    expect(enterAppendMode(deliveryOrder(), [], EMPTY_CATALOG).context.mode).toBe("append");
    expect(enterEditMode(deliveryOrder(), [], EMPTY_CATALOG).context.mode).toBe("revise");
  });

  it("carries the delivery fee and the revision number exactly as an edit does", () => {
    const { context } = enterAppendMode(deliveryOrder(), [], EMPTY_CATALOG);

    expect(context.deliveryFee).toBe(50);
    expect(context.expectedRevisionNumber).toBe(3);
    expect(context.carriedCharges).toBe(10);
  });
});

describe("effectiveEditCart", () => {
  it("is the register cart itself while editing", () => {
    const { context } = enterEditMode(deliveryOrder(), [], EMPTY_CATALOG);
    const cart = cartWith({ menuItemId: "item-tea", name: "Tea", basePrice: 60, quantity: 1 });

    expect(effectiveEditCart(cart, context)).toEqual(cart);
  });

  it("puts the original food back in front of the new round while appending", () => {
    const { context } = enterAppendMode(deliveryOrder(), [], EMPTY_CATALOG);
    const cart = cartWith({ menuItemId: "item-tea", name: "Tea", basePrice: 60, quantity: 1 });

    const merged = effectiveEditCart(cart, context);

    expect(merged).toHaveLength(2);
    expect(merged.map((line) => line.menuItemId)).toEqual(["item-latte", "item-tea"]);
  });

  it("stacks a second helping onto the line the order already had, rather than listing it twice", () => {
    const { context } = enterAppendMode(deliveryOrder(), [], EMPTY_CATALOG);
    const cart = cartWith({ menuItemId: "item-latte", name: "Latte", basePrice: 100, quantity: 1 });

    const merged = effectiveEditCart(cart, context);

    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
    expect(merged[0].subtotal).toBe(300);
  });

  it("never mutates the remembered original lines", () => {
    const { context } = enterAppendMode(deliveryOrder(), [], EMPTY_CATALOG);
    const cart = cartWith({ menuItemId: "item-latte", name: "Latte", basePrice: 100, quantity: 1 });

    effectiveEditCart(cart, context);

    expect(context.appendBaseCart[0].quantity).toBe(2);
  });
});

describe("editModeTotals while appending", () => {
  it("bills the original food as well as the new round", () => {
    const { context } = enterAppendMode(deliveryOrder(), [], EMPTY_CATALOG);
    const cart = cartWith({ menuItemId: "item-tea", name: "Tea", basePrice: 60, quantity: 1 });

    const totals = editModeTotals(cart, context);

    // ₱200 already ordered + ₱60 new + ₱50 delivery + ₱10 service charge.
    expect(totals.itemsTotal).toBe(260);
    expect(totals.newTotal).toBe(320);
  });

  it("asks the cashier to add something instead of offering to save nothing", () => {
    const { context } = enterAppendMode(deliveryOrder(), [], EMPTY_CATALOG);

    const totals = editModeTotals([], context);

    expect(totals.canSave).toBe(false);
    expect(totals.blockedReason).toMatch(/add/i);
  });

  it("does not accuse the cashier of emptying an order they only just opened", () => {
    const { context } = enterAppendMode(deliveryOrder(), [], EMPTY_CATALOG);

    expect(editModeTotals([], context).blockedReason).not.toMatch(/cancel it instead/i);
  });

  it("charges only the new round when the original was already paid for", () => {
    const { context } = enterAppendMode(deliveryOrder(), [{ kind: "charge", amount: 260 }], EMPTY_CATALOG);
    const cart = cartWith({ menuItemId: "item-tea", name: "Tea", basePrice: 60, quantity: 1 });

    expect(editModeTotals(cart, context).balance).toBe(60);
  });
});

describe("canAppendToOrder", () => {
  const base = { backend: "convex" as const, user: OWNER };

  it("allows a round to be added while the kitchen is still cooking", () => {
    expect(canAppendToOrder({ ...base, status: "preparing" }).allowed).toBe(true);
  });

  it("allows a round to be added to an order waiting at the pass", () => {
    expect(canAppendToOrder({ ...base, status: "ready" }).allowed).toBe(true);
  });

  it("refuses an order already handed over, and says why", () => {
    const gate = canAppendToOrder({ ...base, status: "delivered" });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/delivered/i);
  });

  it("refuses a cancelled order", () => {
    expect(canAppendToOrder({ ...base, status: "cancelled" }).allowed).toBe(false);
  });

  it("refuses a backend that cannot write orders at all", () => {
    expect(canAppendToOrder({ ...base, status: "confirmed", backend: "supabase" }).allowed).toBe(
      false,
    );
  });

  it("still requires permission to change someone's bill", () => {
    const waiter: StaffPermissionHolder = { role: "admin", isOwner: false, permissions: [] };

    expect(canAppendToOrder({ ...base, status: "preparing", user: waiter }).allowed).toBe(false);
  });
});

describe("canEnterAppendMode", () => {
  it("refuses to append on top of a counter sale in progress", () => {
    const cart = cartWith({ menuItemId: "item-tea", name: "Tea", basePrice: 60, quantity: 1 });

    const gate = canEnterAppendMode({
      cart,
      status: "preparing",
      backend: "convex",
      user: OWNER,
    });

    expect(gate.allowed).toBe(false);
    expect(gate.remedy?.action).toBe("clear_register");
  });

  it("admits an append onto an empty register while the kitchen cooks", () => {
    expect(
      canEnterAppendMode({ cart: [], status: "preparing", backend: "convex", user: OWNER })
        .allowed,
    ).toBe(true);
  });
});
