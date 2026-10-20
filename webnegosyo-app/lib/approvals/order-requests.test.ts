import { orderEntries, orderRequestToShow, toRequestOrder } from "./order-requests";
import { approvalRequest, FIXTURE_NOW } from "./test-fixtures";

describe("orderRequestToShow", () => {
  test("the newest request on this order while it is still moving", () => {
    const old = approvalRequest({ id: "old", status: "declined", createdAt: "2026-10-12T04:00:00.000Z", updatedAt: "2026-10-12T04:05:00.000Z" });
    const live = approvalRequest({ id: "live", createdAt: "2026-10-12T04:20:00.000Z" });
    const other = approvalRequest({ id: "other", externalOrderId: "order-99", createdAt: "2026-10-12T04:25:00.000Z" });
    expect(orderRequestToShow([old, live, other], "order-14", FIXTURE_NOW, [])?.id).toBe("live");
  });

  test("a final answer stays for an hour, until dismissed", () => {
    const done = approvalRequest({ status: "executed", updatedAt: "2026-10-12T04:00:00.000Z" });
    expect(orderRequestToShow([done], "order-14", FIXTURE_NOW, [])?.id).toBe("req-1");
    expect(orderRequestToShow([done], "order-14", FIXTURE_NOW, ["req-1"])).toBeNull();
    expect(orderRequestToShow([done], "order-14", new Date("2026-10-12T05:01:00.000Z"), [])).toBeNull();
  });
});

describe("orderEntries", () => {
  const base = {
    isApprovalsStore: true,
    canAsk: true,
    holdsOrders: true,
    isUnpaid: false,
    refundable: 480,
    status: "preparing",
    hasActiveRequest: false,
  };

  test("a paid order offers Refund; Ask to cancel only for staff without the orders grant", () => {
    expect(orderEntries(base)).toEqual({ canRefund: true, canAskToCancel: false });
    expect(orderEntries({ ...base, holdsOrders: false })).toEqual({ canRefund: true, canAskToCancel: true });
  });

  test("an unpaid order offers neither (and keeps Cancel hidden for staff without orders)", () => {
    expect(orderEntries({ ...base, isUnpaid: true, holdsOrders: false })).toEqual({ canRefund: false, canAskToCancel: false });
  });

  test("nothing while a request is open, on other store types, or for accounts that cannot ask", () => {
    expect(orderEntries({ ...base, hasActiveRequest: true })).toEqual({ canRefund: false, canAskToCancel: false });
    expect(orderEntries({ ...base, isApprovalsStore: false })).toEqual({ canRefund: false, canAskToCancel: false });
    expect(orderEntries({ ...base, canAsk: false })).toEqual({ canRefund: false, canAskToCancel: false });
  });

  test("a delivered or cancelled order can be refunded but not cancelled", () => {
    expect(orderEntries({ ...base, holdsOrders: false, status: "delivered" })).toEqual({ canRefund: true, canAskToCancel: false });
    expect(orderEntries({ ...base, holdsOrders: false, status: "cancelled" })).toEqual({ canRefund: true, canAskToCancel: false });
    expect(orderEntries({ ...base, refundable: 0 })).toEqual({ canRefund: false, canAskToCancel: false });
  });
});

describe("toRequestOrder", () => {
  test("keeps only lines the server can address (order_items ids)", () => {
    const order = toRequestOrder({
      id: "order-14",
      label: "#14",
      refundable: 480,
      paymentLabel: "Cash",
      createdAt: "2026-10-12T04:02:00.000Z",
      outletId: null,
      items: [
        { _id: "i-1", menuItemName: "Sisig", quantity: 2, subtotal: 370 },
        { menuItemName: "No id", quantity: 1, subtotal: 50 },
      ],
    });
    expect(order.items).toEqual([{ id: "i-1", name: "Sisig", quantity: 2, lineTotal: 370 }]);
    expect(order.paymentLabel).toBe("cash");
  });
});
