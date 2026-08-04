/**
 * Editing a placed order inside the register.
 *
 * The standalone edit and settle screens are being folded into the POS, so the
 * judgement they carried has to live here instead — Jest is scoped to `lib/`
 * in this app, and a decision made in `pos.tsx` or `pos-tender.tsx` is a
 * decision made untested.
 *
 * Two things this module exists to stop:
 *
 * 1. A placed order landing on top of a half-rung counter sale. The register
 *    cart is a single global store, so loading an order into a non-empty one
 *    would merge one customer's food into another's bill.
 * 2. An order's delivery fee and service charge evaporating on the first edit.
 *    The register computes a service charge from the order TYPE and knows
 *    nothing about delivery, so an edited ₱50-delivery order would silently
 *    re-total without it and the customer would be undercharged.
 */

import {
  canEnterEditMode,
  editModeTotals,
  enterEditMode,
  type OrderEditContext,
} from "./pos-edit-mode";
import type { ModifierCatalog } from "./order-edit-cart";
import type { OrderItemDto } from "./backends/supabase-orders";
import type { StaffPermissionHolder } from "./staff-permissions";
import type { PosCartLine } from "./pos-cart";
import { addLine } from "./pos-cart";

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

/** A delivery order: ₱200 of food, ₱50 to deliver it, ₱10 service charge. */
function deliveryOrder() {
  return {
    _id: "order-1",
    total: 260,
    revisionNumber: 0,
    deliveryFee: 50,
    items: [orderItem()],
  };
}

function cartOf(...inputs: { id: string; price: number; qty: number }[]): PosCartLine[] {
  return inputs.reduce<PosCartLine[]>(
    (cart, input) =>
      addLine(cart, {
        menuItemId: input.id,
        name: input.id,
        basePrice: input.price,
        quantity: input.qty,
        selections: [],
      }),
    [],
  );
}

describe("canEnterEditMode", () => {
  it("allows opening an editable order on an empty register", () => {
    const gate = canEnterEditMode({
      cart: [],
      status: "confirmed",
      backend: "platform",
      user: OWNER,
    });

    expect(gate).toEqual({ allowed: true });
  });

  /**
   * The register cart is one global store shared with counter sales. Loading a
   * placed order into a cart that already has items would fold a waiting
   * customer's food into the order being edited — and the cashier would only
   * find out at the tender screen, after the bill was rewritten.
   */
  it("refuses while a counter sale is still open on the register", () => {
    const gate = canEnterEditMode({
      cart: cartOf({ id: "item-bun", price: 60, qty: 1 }),
      status: "confirmed",
      backend: "platform",
      user: OWNER,
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/sale/i);
  });

  it("names the way out rather than just refusing", () => {
    // "You can't" with no next step is how staff end up calling support.
    const gate = canEnterEditMode({
      cart: cartOf({ id: "item-bun", price: 60, qty: 1 }),
      status: "confirmed",
      backend: "platform",
      user: OWNER,
    });

    expect(gate.reason).toMatch(/finish|clear/i);
  });

  /**
   * Naming the way out is not the same as offering it. The order screen has no
   * register on it, so a cashier reading "clear the register" has to leave,
   * find the sale, clear it, navigate back, and remember which order they were
   * on. The remedy is what lets the screen put that behind one button.
   */
  it("offers clearing the register as an action, not just as advice", () => {
    const gate = canEnterEditMode({
      cart: cartOf({ id: "item-bun", price: 60, qty: 1 }),
      status: "confirmed",
      backend: "platform",
      user: OWNER,
    });

    expect(gate.remedy?.action).toBe("clear_register");
    expect(gate.remedy?.label).toMatch(/clear/i);
  });

  it("warns that clearing throws away the sale on the register", () => {
    // Clearing discards a real customer's food. The confirmation is the only
    // thing between a mis-tap and a re-rung order.
    const gate = canEnterEditMode({
      cart: cartOf({ id: "item-bun", price: 60, qty: 1 }),
      status: "confirmed",
      backend: "platform",
      user: OWNER,
    });

    expect(gate.remedy?.confirm).toMatch(/sale|lose|discard/i);
  });

  it("offers no remedy for a refusal clearing the register cannot fix", () => {
    const gate = canEnterEditMode({
      cart: cartOf({ id: "item-bun", price: 60, qty: 1 }),
      status: "preparing",
      backend: "platform",
      user: OWNER,
    });

    expect(gate.remedy).toBeUndefined();
  });

  it("offers no remedy when nothing is blocking", () => {
    const gate = canEnterEditMode({
      cart: [],
      status: "confirmed",
      backend: "platform",
      user: OWNER,
    });

    expect(gate.remedy).toBeUndefined();
  })

  /**
   * The status, permission, backend and branch rules are NOT re-implemented
   * here — they are `canEditOrder`'s, and a second copy would drift from the
   * two write paths that enforce the same thing.
   */
  it("still refuses an order the kitchen has started", () => {
    const gate = canEnterEditMode({
      cart: [],
      status: "preparing",
      backend: "convex",
      user: OWNER,
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/kitchen/i);
  });

  it("reports the order's own refusal ahead of the open-sale one", () => {
    // A delivered order cannot be edited however tidy the register is, so
    // telling the cashier to clear their sale would waste the clearing.
    const gate = canEnterEditMode({
      cart: cartOf({ id: "item-bun", price: 60, qty: 1 }),
      status: "delivered",
      backend: "platform",
      user: OWNER,
    });

    expect(gate.reason).toMatch(/delivered/i);
  });
});

describe("enterEditMode", () => {
  it("loads the order's items into a register cart", () => {
    const { cart } = enterEditMode(deliveryOrder(), [], EMPTY_CATALOG);

    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
    expect(cart[0].unitPrice).toBe(100);
  });

  /**
   * The fee the register cannot compute. `deliveryFee` is a property of the
   * ORDER, not of the cart, so it has to be carried across explicitly or the
   * re-total drops it.
   */
  it("carries the order's delivery fee into the context", () => {
    const { context } = enterEditMode(deliveryOrder(), [], EMPTY_CATALOG);

    expect(context.deliveryFee).toBe(50);
  });

  /**
   * The service charge is NOT stored on an order — not on the platform DTO,
   * not in the Convex schema. `reviseOrder` accepts a `serviceChargeAmount`
   * argument and folds it into the total, but nothing ever persists it, so
   * there is no field to read back on the next edit.
   *
   * It is recoverable, though: whatever the placed total held beyond the line
   * items and the delivery fee is, by definition, the rest of the bill. Here
   * ₱260 − ₱200 of food − ₱50 of delivery leaves the ₱10 charge.
   *
   * Deliberately NOT called "service charge": the residue is whatever the
   * checkout added or took off, which may also be a discount or a rounding
   * adjustment. Naming it for one of its causes would invite someone to
   * recompute it from the order type's rate, which is exactly the mistake.
   */
  it("recovers the rest of the bill from the placed total", () => {
    const { context } = enterEditMode(deliveryOrder(), [], EMPTY_CATALOG);

    expect(context.carriedCharges).toBe(10);
  });

  it("preserves a discount rather than clamping it away", () => {
    // ₱200 of food sold for ₱180. The residue is negative and real; floored at
    // zero it would re-bill the customer the ₱20 they were given.
    const { context } = enterEditMode(
      { _id: "order-3", total: 180, items: [orderItem()] },
      [],
      EMPTY_CATALOG,
    );

    expect(context.carriedCharges).toBe(-20);
  });

  it("carries nothing when the total is exactly its line items", () => {
    const { context } = enterEditMode(
      { _id: "order-2", total: 200, revisionNumber: 0, items: [orderItem()] },
      [],
      EMPTY_CATALOG,
    );

    expect(context.deliveryFee).toBe(0);
    expect(context.carriedCharges).toBe(0);
  });

  /**
   * The identity that makes the whole carry-forward trustworthy: reopening an
   * order and changing nothing must reproduce the bill the customer agreed to,
   * to the centavo. If this drifts, every edit quietly re-prices the order.
   */
  it("reproduces the placed total exactly when nothing is changed", () => {
    const order = deliveryOrder();
    const { context, cart } = enterEditMode(order, [], EMPTY_CATALOG);

    expect(editModeTotals(cart, context).newTotal).toBe(order.total);
  });

  it("records the revision the register opened, for the optimistic lock", () => {
    const { context } = enterEditMode(
      { ...deliveryOrder(), revisionNumber: 3 },
      [],
      EMPTY_CATALOG,
    );

    expect(context.expectedRevisionNumber).toBe(3);
  });

  it("defaults a never-edited order to revision zero", () => {
    const { context } = enterEditMode(
      { _id: "order-2", total: 200, items: [orderItem()] },
      [],
      EMPTY_CATALOG,
    );

    expect(context.expectedRevisionNumber).toBe(0);
  });

  it("keeps the ledger so the register knows what was already paid", () => {
    const { context } = enterEditMode(
      deliveryOrder(),
      [{ kind: "charge", amount: 260 }],
      EMPTY_CATALOG,
    );

    expect(context.payments).toEqual([{ kind: "charge", amount: 260 }]);
  });

  it("reports modifiers that are no longer on the menu instead of dropping them", () => {
    const { warnings } = enterEditMode(
      {
        ...deliveryOrder(),
        items: [
          orderItem({
            variationSelections: [
              { typeName: "Size", optionName: "Venti", priceAdjustment: 0 },
            ],
          }),
        ],
      },
      [],
      EMPTY_CATALOG,
    );

    expect(warnings.join(" ")).toMatch(/Venti/);
  });

  /**
   * The "before" side of the stock movement an edit will make.
   *
   * `originalItems` cannot serve: it is `RevisedOrderItem[]`, which names its
   * modifiers but carries no option IDS, and stock resolution needs the ids to
   * find an option's recipe. The cart lines have them, so they are captured
   * here at the moment the order is loaded — after the edit begins, the "before"
   * is gone.
   */
  it("captures the order's stock items, option ids and all", () => {
    const { context } = enterEditMode(
      {
        ...deliveryOrder(),
        items: [
          orderItem({
            variationSelections: [
              { typeName: "Size", optionName: "Large", priceAdjustment: 0 },
            ],
          }),
        ],
      },
      [],
      {
        "item-latte": [
          {
            id: "grp-size",
            name: "Size",
            min_select: 1,
            max_select: 1,
            options: [
              { id: "opt-large", name: "Large", price_modifier: 0 },
            ],
          },
        ],
      } as never,
    );

    expect(context.originalStockItems).toEqual([
      { menuItemId: "item-latte", quantity: 2, optionIds: ["opt-large"] },
    ]);
  });

  it("remembers the bill as placed, for the was/now header", () => {
    const { context } = enterEditMode(deliveryOrder(), [], EMPTY_CATALOG);

    expect(context.originalTotal).toBe(260);
  });
});

describe("editModeTotals", () => {
  function contextWith(overrides: Partial<OrderEditContext> = {}): OrderEditContext {
    return {
      orderId: "order-1",
      expectedRevisionNumber: 0,
      originalTotal: 260,
      deliveryFee: 50,
      carriedCharges: 10,
      payments: [{ kind: "charge", amount: 260 }],
      // No recorded breakdown: these cases predate discounts, and an order
      // without one keeps its whole residue inside `carriedCharges`.
      storedDiscount: null,
      discountVouchers: null,
      originalItems: [
        {
          menuItemId: "item-latte",
          menuItemName: "item-latte",
          quantity: 2,
          price: 100,
          subtotal: 200,
        },
      ],
      originalStockItems: [
        { menuItemId: "item-latte", quantity: 2, optionIds: [] },
      ],
      ...overrides,
    };
  }

  /**
   * The regression this whole module is built around. Totalling the cart alone
   * would re-bill a ₱260 delivery order at ₱200 and hand the customer ₱60 back
   * — ₱50 of which was the courier's.
   */
  it("adds the carried delivery fee and remaining charges to the items total", () => {
    const totals = editModeTotals(cartOf({ id: "item-latte", price: 100, qty: 2 }), contextWith());

    expect(totals.itemsTotal).toBe(200);
    expect(totals.newTotal).toBe(260);
  });

  it("keeps the fees whole when the items change", () => {
    // Adding a third latte must move the total by ₱100, not reset the fees.
    const totals = editModeTotals(cartOf({ id: "item-latte", price: 100, qty: 3 }), contextWith());

    expect(totals.newTotal).toBe(360);
  });

  it("reports nothing owing when the edit did not move the money", () => {
    const totals = editModeTotals(cartOf({ id: "item-latte", price: 100, qty: 2 }), contextWith());

    expect(totals.balance).toBe(0);
    expect(totals.intent).toBe("settled");
  });

  it("asks the cashier to collect when the edit raised the bill", () => {
    const totals = editModeTotals(cartOf({ id: "item-latte", price: 100, qty: 3 }), contextWith());

    expect(totals.balance).toBe(100);
    expect(totals.intent).toBe("collect");
  });

  it("asks the cashier to refund when the edit lowered the bill", () => {
    const totals = editModeTotals(cartOf({ id: "item-latte", price: 100, qty: 1 }), contextWith());

    expect(totals.balance).toBe(-100);
    expect(totals.intent).toBe("refund");
  });

  /**
   * An order billed but never tendered — a delivery awaiting cash on handover.
   * It must open owing its whole total, not looking square.
   */
  it("owes the full total when nothing was ever paid", () => {
    const totals = editModeTotals(
      cartOf({ id: "item-latte", price: 100, qty: 2 }),
      contextWith({ payments: [] }),
    );

    expect(totals.balance).toBe(260);
    expect(totals.intent).toBe("collect");
  });

  it("nets a prior refund out of what is still owed", () => {
    const totals = editModeTotals(
      cartOf({ id: "item-latte", price: 100, qty: 2 }),
      contextWith({
        payments: [
          { kind: "charge", amount: 260 },
          { kind: "refund", amount: 60 },
        ],
      }),
    );

    expect(totals.balance).toBe(60);
  });

  it("blocks saving an emptied order and says why", () => {
    // Removing every line is a cancellation, which has its own stock and
    // refund consequences and its own path.
    const totals = editModeTotals([], contextWith());

    expect(totals.canSave).toBe(false);
    expect(totals.blockedReason).toMatch(/cancel/i);
  });

  it("blocks saving when nothing was actually changed", () => {
    // A no-op save would still bump the revision and write an audit row
    // claiming an edit that never happened.
    const totals = editModeTotals(
      cartOf({ id: "item-latte", price: 100, qty: 2 }),
      contextWith({
        originalItems: [
          { menuItemId: "item-latte", menuItemName: "item-latte", quantity: 2, price: 100, subtotal: 200 },
        ],
      }),
    );

    expect(totals.canSave).toBe(false);
  });

  it("allows saving once a line actually moved", () => {
    const totals = editModeTotals(
      cartOf({ id: "item-latte", price: 100, qty: 3 }),
      contextWith({
        originalItems: [
          { menuItemId: "item-latte", menuItemName: "item-latte", quantity: 2, price: 100, subtotal: 200 },
        ],
      }),
    );

    expect(totals.canSave).toBe(true);
  });
});
