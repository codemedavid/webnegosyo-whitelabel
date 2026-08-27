/**
 * The delivery-fee journey, driven through the REAL register store.
 *
 * Mocks nothing that prices a sale, for the same reason as
 * `pos-voucher-journey.test.ts`: the pure modules were covered while the wiring
 * leaked money. The specific wiring defect this suite pins: `discountBasis`
 * hardcoded `deliveryFee: 0` for counter sales, so a free-delivery voucher on a
 * POS delivery order was rejected as `no_delivery_fee`, and no fee ever reached
 * the total or the placed order.
 */

import { buildPosOrder } from "../lib/pos-order";
import { enterEditMode } from "../lib/pos-edit-mode";
import type { Voucher } from "../lib/vouchers/types";
import { useAuthStore } from "./auth-store";
import { usePosCartStore } from "./pos-cart-store";
import { clearedSaleDelivery } from "../lib/pos-delivery";

const LATTE = {
  menuItemId: "m-latte",
  name: "Latte",
  basePrice: 150,
  quantity: 2,
  selections: [],
};

const SERVICE_CHARGE = { type: "percentage", value: 10 } as const;

const FREE_DELIVERY: Voucher = {
  id: "v-freedel",
  code: "FREEDEL",
  name: "Free delivery",
  discountType: "free_delivery",
  discountValue: 0,
  scope: "universal",
  isStackable: true,
  usedCount: 0,
  channels: ["pos", "checkout"],
  isActive: true,
};

const store = () => usePosCartStore.getState();

function openRegister(serviceCharge?: typeof SERVICE_CHARGE): void {
  usePosCartStore.setState({
    lines: [],
    editContext: null,
    editWarnings: [],
    orderTypeId: null,
    orderTypeName: null,
    serviceCharge,
    customerName: "",
    attachedCustomer: null,
    discount: { vouchers: [], manual: null },
    ...clearedSaleDelivery(),
  });
}

beforeEach(() => {
  openRegister();
  useAuthStore.setState({ outletId: null });
});

describe("journey — a delivery sale rung up at the counter", () => {
  beforeEach(() => {
    store().add(LATTE);
    store().setDelivery({ fee: 50, address: "12 Mabini St", phone: "0917 000 1234" });
  });

  it("bills the fee into the one total the cashier sees", () => {
    const totals = store().totals();
    expect(totals.subtotal).toBe(300);
    expect(totals.deliveryFee).toBe(50);
    expect(totals.total).toBe(350);
  });

  it("stacks the fee with the order type's service charge", () => {
    openRegister(SERVICE_CHARGE);
    store().add(LATTE);
    store().setDelivery({ fee: 50 });

    const totals = store().totals();
    expect(totals.serviceCharge).toBe(30);
    expect(totals.total).toBe(380);
  });

  it("places an order that charges the fee and carries the contact details", () => {
    const order = buildPosOrder({
      cart: store().lines,
      serviceCharge: store().serviceCharge,
      delivery: store().delivery,
      tender: { methodName: "Cash", isCash: true, cashTendered: 400, changeDue: 50 },
      clientOrderId: "sale-del-1",
    });

    expect(order.total).toBe(store().totals().total);
    expect(order.deliveryFee).toBe(50);
    expect(order.customerData.delivery_address).toBe("12 Mabini St");
  });
});

describe("journey — free-delivery voucher at the counter", () => {
  it("is rejected while the sale has no delivery fee", () => {
    store().add(LATTE);
    store().applyVoucher(FREE_DELIVERY);

    expect(store().sessionDiscount().total).toBe(0);
    expect(store().sessionDiscount().rejected).toHaveLength(1);
  });

  it("takes the fee off once one is attached", () => {
    store().add(LATTE);
    store().setDelivery({ fee: 50 });
    store().applyVoucher(FREE_DELIVERY);

    expect(store().sessionDiscount().total).toBe(50);
    // ₱300 merchandise + ₱50 fee − ₱50 free delivery.
    expect(store().totals().total).toBe(300);
  });
});

describe("journey — delivery state cannot outlive its sale", () => {
  it("clears fee, address, and phone on reset", () => {
    store().add(LATTE);
    store().setDelivery({ fee: 50, address: "12 Mabini St", phone: "0917 000 1234" });

    store().reset();

    expect(store().delivery).toEqual({ fee: null, address: "", phone: "" });
    expect(store().totals().deliveryFee).toBe(0);
  });

  it("merges partial updates without dropping the rest", () => {
    store().setDelivery({ fee: 50 });
    store().setDelivery({ address: "12 Mabini St" });

    expect(store().delivery).toEqual({ fee: 50, address: "12 Mabini St", phone: "" });
  });
});

describe("journey — correcting the fee on a placed order", () => {
  const CATALOG = {};
  const placedOrder = {
    _id: "order-1",
    total: 260,
    revisionNumber: 0,
    deliveryFee: 50,
    items: [
      {
        _id: "oi-1",
        orderId: "order-1",
        menuItemId: "m-latte",
        menuItemName: "Latte",
        quantity: 2,
        price: 100,
        subtotal: 200,
        addons: [],
      },
    ],
  };

  it("re-prices the edit with the corrected fee and makes it saveable", () => {
    store().beginEdit(enterEditMode(placedOrder, [], CATALOG));

    store().setEditDeliveryFee(80);

    const totals = store().editTotals();
    // ₱200 items + ₱80 fee + ₱10 carried charge.
    expect(totals?.newTotal).toBe(290);
    expect(totals?.canSave).toBe(true);
    store().endEdit();
  });

  it("is ignored on an ordinary counter sale — there is no edit to re-price", () => {
    store().add(LATTE);
    store().setEditDeliveryFee(80);
    expect(store().editContext).toBeNull();
    expect(store().totals().deliveryFee).toBe(0);
  });
});
