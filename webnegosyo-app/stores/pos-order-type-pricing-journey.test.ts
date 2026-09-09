/**
 * Per-order-type pricing, driven through the REAL register store.
 *
 * Same reasoning as `pos-delivery-journey.test.ts`: the pure module and the
 * glue are covered on their own, but the money defect this feature could ship
 * is in the wiring — a chip switch that never reaches the lines, a markup that
 * compounds on the second switch, or a placed order re-priced under edit. So
 * nothing that prices a sale is mocked; every assertion is on what the store
 * would hand the tender screen.
 */

import type { OrderTypePricing } from "../lib/order-type-pricing";
import { enterEditMode } from "../lib/pos-edit-mode";
import { clearedSaleDelivery } from "../lib/pos-delivery";
import { usePosCartStore } from "./pos-cart-store";

const LATTE = {
  menuItemId: "m-latte",
  name: "Latte",
  listBasePrice: 100,
  basePrice: 100,
  quantity: 1,
  selections: [],
};

const GRAB_25: OrderTypePricing = {
  orderTypeId: "ot-grab",
  markupPercent: 25,
  itemPrices: {},
};

const FOODPANDA_OVERRIDE: OrderTypePricing = {
  orderTypeId: "ot-fp",
  markupPercent: 30,
  itemPrices: { "m-latte": 110 },
};

const store = () => usePosCartStore.getState();

function openRegister(): void {
  usePosCartStore.setState({
    lines: [],
    editContext: null,
    editWarnings: [],
    orderTypeId: null,
    orderTypeName: null,
    serviceCharge: undefined,
    orderTypePricing: null,
    customerName: "",
    attachedCustomer: null,
    discount: { vouchers: [], manual: null },
    ...clearedSaleDelivery(),
  });
}

beforeEach(openRegister);

describe("journey — switching the channel mid-sale", () => {
  it("prices a dine-in latte at the store price", () => {
    store().setOrderType("ot-dine", "Dine In", undefined);
    store().add(LATTE);
    expect(store().totals().total).toBe(100);
  });

  it("re-prices the sale when the cashier switches to Grab", () => {
    store().setOrderType("ot-dine", "Dine In", undefined);
    store().add(LATTE);

    store().setOrderType("ot-grab", "Grab", undefined, GRAB_25);

    expect(store().lines[0].basePrice).toBe(125);
    expect(store().totals().total).toBe(125);
    expect(store().orderTypePricing).toEqual(GRAB_25);
  });

  it("restores the store price when they switch back", () => {
    store().setOrderType("ot-dine", "Dine In", undefined);
    store().add(LATTE);
    store().setOrderType("ot-grab", "Grab", undefined, GRAB_25);

    store().setOrderType("ot-dine", "Dine In", undefined);

    expect(store().totals().total).toBe(100);
    expect(store().orderTypePricing).toBeNull();
  });

  it("never compounds when the same chip is tapped twice", () => {
    store().add(LATTE);
    store().setOrderType("ot-grab", "Grab", undefined, GRAB_25);
    store().setOrderType("ot-grab", "Grab", undefined, GRAB_25);
    expect(store().totals().total).toBe(125);
  });

  it("keeps the line stacking across a switch", () => {
    store().add(LATTE);
    store().setOrderType("ot-grab", "Grab", undefined, GRAB_25);
    store().add(LATTE);
    expect(store().lines).toHaveLength(1);
    expect(store().lines[0].quantity).toBe(2);
    expect(store().totals().total).toBe(250);
  });
});

describe("journey — ringing up while a channel is active", () => {
  it("prices a new line at the channel's markup", () => {
    store().setOrderType("ot-grab", "Grab", undefined, GRAB_25);
    store().add(LATTE);
    expect(store().lines[0].basePrice).toBe(125);
    expect(store().lines[0].listBasePrice).toBe(100);
    expect(store().totals().total).toBe(125);
  });

  it("charges an item's exact override for that channel", () => {
    store().setOrderType("ot-fp", "foodpanda", undefined, FOODPANDA_OVERRIDE);
    store().add(LATTE);
    expect(store().totals().total).toBe(110);
  });
});

describe("journey — editing a placed order", () => {
  const placedOrder = {
    _id: "order-1",
    total: 100,
    revisionNumber: 0,
    deliveryFee: 0,
    items: [
      {
        _id: "oi-1",
        orderId: "order-1",
        menuItemId: "m-latte",
        menuItemName: "Latte",
        quantity: 1,
        price: 100,
        subtotal: 100,
        addons: [],
      },
    ],
  };

  it("leaves the placed prices alone when an order type with pricing is set", () => {
    store().beginEdit(enterEditMode(placedOrder, [], {}));
    const [placed] = store().lines;

    store().setOrderType("ot-grab", "Grab", undefined, GRAB_25);

    expect(store().lines[0]).toBe(placed);
    expect(store().editTotals()?.newTotal).toBe(100);
    store().endEdit();
  });

  it("does not mark up a line added during the edit", () => {
    store().setOrderType("ot-grab", "Grab", undefined, GRAB_25);
    store().beginEdit(enterEditMode(placedOrder, [], {}));

    store().add({ ...LATTE, note: "extra hot" });

    expect(store().lines[1].basePrice).toBe(100);
    store().endEdit();
  });
});

describe("journey — the channel outlives the sale", () => {
  it("keeps the pricing across reset, as it keeps the order type", () => {
    store().setOrderType("ot-grab", "Grab", undefined, GRAB_25);
    store().add(LATTE);

    store().reset();
    store().add(LATTE);

    expect(store().orderTypePricing).toEqual(GRAB_25);
    expect(store().totals().total).toBe(125);
  });
});
