import { buildPosOrder, type PosOrderContext, type PosTender } from "./pos-order";
import { addLine, type PosCartLine } from "./pos-cart";
import { ORDER_OUTLET_ID_KEY, ORDER_OUTLET_NAME_KEY } from "./order-outlet";

/**
 * A counter sale belongs to the counter that rang it up.
 *
 * Without a branch on the order, the staff who took the sale cannot see it —
 * a branch-scoped account reads only its own branch, and an unattributed order
 * belongs to no branch at all. So the register stamps the branch of whoever is
 * signed in.
 *
 * A single-location store passes no branch and must produce byte-for-byte the
 * order it produces today.
 */

const CART: PosCartLine[] = addLine([], {
  menuItemId: "m-latte",
  name: "Latte",
  basePrice: 100,
  quantity: 1,
  selections: [],
});

const CASH_TENDER: PosTender = {
  methodName: "Cash",
  isCash: true,
  cashTendered: 200,
  changeDue: 100,
};

function context(overrides: Partial<PosOrderContext> = {}): PosOrderContext {
  return {
    cart: CART,
    tender: CASH_TENDER,
    clientOrderId: "client-1",
    ...overrides,
  };
}

describe("buildPosOrder branch stamping", () => {
  it("records the branch that rang up the sale", () => {
    const order = buildPosOrder(
      context({ outlet: { id: "outlet-north", name: "North Branch" } })
    );

    expect(order.customerData[ORDER_OUTLET_ID_KEY]).toBe("outlet-north");
    expect(order.customerData[ORDER_OUTLET_NAME_KEY]).toBe("North Branch");
  });

  it("adds no branch keys for a single-location register", () => {
    const order = buildPosOrder(context());

    expect(ORDER_OUTLET_ID_KEY in order.customerData).toBe(false);
    expect(ORDER_OUTLET_NAME_KEY in order.customerData).toBe(false);
  });

  it("adds no branch keys when the branch is null", () => {
    const order = buildPosOrder(context({ outlet: null }));

    expect(ORDER_OUTLET_ID_KEY in order.customerData).toBe(false);
  });

  it("keeps the payment blob intact alongside the branch", () => {
    const order = buildPosOrder(
      context({ outlet: { id: "outlet-north", name: "North Branch" } })
    );

    expect(order.customerData.pos).toBeDefined();
  });

  it("preserves other customerData the caller assembled", () => {
    const order = buildPosOrder(
      context({
        outlet: { id: "outlet-north", name: "North Branch" },
        customerData: { schedule: "2026-08-01" },
      })
    );

    expect(order.customerData.schedule).toBe("2026-08-01");
    expect(order.customerData[ORDER_OUTLET_ID_KEY]).toBe("outlet-north");
  });

  it("does not let caller-supplied customerData forge the branch", () => {
    const order = buildPosOrder(
      context({
        outlet: { id: "outlet-north", name: "North Branch" },
        customerData: { [ORDER_OUTLET_ID_KEY]: "outlet-south" },
      })
    );

    expect(order.customerData[ORDER_OUTLET_ID_KEY]).toBe("outlet-north");
  });
});
