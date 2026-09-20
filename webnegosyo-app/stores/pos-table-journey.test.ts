/**
 * The table journey, driven through the REAL register store.
 *
 * A dine-in sale names its table the way a web order does — in
 * customerData.table_number — so the order card, kitchen ticket, receipt and
 * floor plan all see it. This pins the wiring: the slice lands on the placed
 * order, is cleared with the sale (a table left attached would seat the next
 * customer at the last one's table), and leaves when the order type stops
 * being dine-in.
 */

import { buildPosOrder } from "../lib/pos-order";
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
    serviceCharge: undefined,
    customerName: "",
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
  return buildPosOrder({
    cart: store().lines,
    serviceCharge: store().serviceCharge,
    delivery: store().delivery,
    table: store().table,
    tender: { methodName: "Cash", isCash: true, cashTendered: 200, changeDue: 50 },
    clientOrderId: "sale-table-1",
  });
}

describe("journey — a dine-in sale rung up at the counter", () => {
  beforeEach(() => {
    store().setOrderType("ot-dinein", "Dine In", undefined, null, "dine_in");
    store().add(LATTE);
    store().setTable({ label: "Table 12", tableId: "t-12", partySize: 3 });
  });

  it("holds the table on the sale", () => {
    expect(store().table).toEqual({ label: "Table 12", tableId: "t-12", partySize: 3 });
  });

  it("places an order that names the table the way every reader expects", () => {
    const order = placedOrder();
    expect(order.customerData.table_number).toBe("12");
    expect(order.customerData.party_size).toBe(3);
  });

  it("clears the table with the sale, so the next customer is not seated at it", () => {
    store().reset();
    expect(store().table).toEqual(clearedSaleTable().table);
    store().add(LATTE);
    expect(placedOrder().customerData.table_number).toBeUndefined();
  });

  it("drops the table when the sale stops being dine-in", () => {
    store().setOrderType("ot-pickup", "Pickup", undefined, null, "pickup");
    expect(store().table).toEqual(clearedSaleTable().table);
  });

  it("keeps the table when the dine-in type is re-chosen", () => {
    store().setOrderType("ot-dinein", "Dine In", undefined, null, "dine_in");
    expect(store().table.label).toBe("Table 12");
  });

  it("drops the table when an order type of unknown kind is chosen", () => {
    store().setOrderType("ot-other", "Other", undefined, null);
    expect(store().table).toEqual(clearedSaleTable().table);
  });
});

describe("journey — an untabled sale", () => {
  it("sends the exact customerData shape every deployed backend accepts", () => {
    store().add(LATTE);
    const order = placedOrder();
    expect(order.customerData).not.toHaveProperty("table_number");
    expect(order.customerData).not.toHaveProperty("party_size");
  });
});
