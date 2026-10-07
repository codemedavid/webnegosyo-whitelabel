/**
 * The optional dine-in phone, driven through the REAL register store.
 *
 * A seated guest is not asked for a number to complete the order, but without
 * one the store cannot reach them again — no call about a sold-out item, no
 * loyalty, no follow-up. The register offers an optional box on dine-in sales;
 * this pins that what is typed there lands on the placed order as its contact,
 * leaves with the sale, and leaves when the sale stops being dine-in.
 */

import { buildPosOrder } from "../lib/pos-order";
import { posCustomerFields } from "../lib/customers/pos-attachment";
import { clearedSaleTable } from "../lib/pos-table";
import { clearedSaleDelivery } from "../lib/pos-delivery";
import { useAuthStore } from "./auth-store";
import { usePosCartStore } from "./pos-cart-store";

const LATTE = {
  menuItemId: "m-latte",
  name: "Latte",
  basePrice: 150,
  quantity: 1,
  selections: [],
};

const store = () => usePosCartStore.getState();

function openRegister(): void {
  usePosCartStore.setState({
    lines: [],
    editContext: null,
    editWarnings: [],
    orderTypeId: null,
    orderTypeName: null,
    orderTypeKind: null,
    serviceCharge: undefined,
    customerName: "",
    customerPhone: "",
    attachedCustomer: null,
    discount: { vouchers: [], manual: null },
    ...clearedSaleDelivery(),
    ...clearedSaleTable(),
  });
}

beforeEach(() => {
  openRegister();
  useAuthStore.setState({ outletId: null });
});

function placedOrder() {
  const state = store();
  return buildPosOrder({
    cart: state.lines,
    tender: { methodName: "Cash", isCash: true, cashTendered: 200, changeDue: 50 },
    clientOrderId: "sale-phone-1",
    ...posCustomerFields(state.attachedCustomer, state.customerName, state.customerPhone),
  });
}

describe("journey — a dine-in guest leaves a number", () => {
  beforeEach(() => {
    store().setOrderType("ot-dinein", "Dine In", undefined, null, "dine_in");
    store().add(LATTE);
  });

  it("remembers which kind of order type the sale is", () => {
    expect(store().orderTypeKind).toBe("dine_in");
  });

  it("places the order with the number as its contact", () => {
    store().setCustomerPhone("0917 123 4567");
    expect(placedOrder().customerContact).toBe("+639171234567");
  });

  it("places an ordinary walk-in order when the box is left empty", () => {
    expect(placedOrder().customerContact).toBe("");
  });

  it("clears the number with the sale, so the next guest does not inherit it", () => {
    store().setCustomerPhone("09171234567");
    store().reset();
    expect(store().customerPhone).toBe("");
  });

  it("keeps the order type kind across sales, like the order type itself", () => {
    store().reset();
    expect(store().orderTypeKind).toBe("dine_in");
  });

  it("drops the number when the sale stops being dine-in, since the box is gone", () => {
    store().setCustomerPhone("09171234567");
    store().setOrderType("ot-pickup", "Pick Up", undefined, null, "pickup");
    expect(store().customerPhone).toBe("");
    expect(store().orderTypeKind).toBe("pickup");
  });
});
