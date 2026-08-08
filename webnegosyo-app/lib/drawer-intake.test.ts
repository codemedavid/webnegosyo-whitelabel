/**
 * The Drawer's order-intake rules.
 *
 * The Drawer is where a cashier both watches money and now accepts the orders
 * that will become it, so the "can I confirm this?" question must be answered
 * in one pure place rather than re-derived by each button.
 */

import {
  canConfirmFromDrawer,
  selectDrawerIncoming,
  type DrawerOrder,
} from "./drawer-intake";

function order(overrides: Partial<DrawerOrder> = {}): DrawerOrder {
  return {
    _id: "web-1",
    _creationTime: 1_000,
    source: "web",
    status: "pending",
    total: 250,
    ...overrides,
  };
}

describe("selectDrawerIncoming", () => {
  it("lists open orders that did not come from this register, newest first", () => {
    // Arrange
    const queue = {
      pending: [order({ _id: "a", _creationTime: 1 })],
      confirmed: [order({ _id: "b", _creationTime: 5, status: "confirmed" })],
    };

    // Act
    const rows = selectDrawerIncoming(queue);

    // Assert
    expect(rows.map((row) => row._id)).toEqual(["b", "a"]);
  });

  it("excludes the register's own counter sales", () => {
    // Arrange
    const queue = { pending: [order({ _id: "till", source: "pos" })] };

    // Act
    const rows = selectDrawerIncoming(queue);

    // Assert
    expect(rows).toEqual([]);
  });

  it("shows a manually entered order, which is not a counter sale", () => {
    // Arrange — phone-in orders taken on the app belong in the intake list.
    const queue = { pending: [order({ _id: "phone", source: "manual" })] };

    // Act
    const rows = selectDrawerIncoming(queue);

    // Assert
    expect(rows.map((row) => row._id)).toEqual(["phone"]);
  });
});

describe("canConfirmFromDrawer", () => {
  it("allows a pending order to be confirmed", () => {
    // Act
    const gate = canConfirmFromDrawer(order({ status: "pending" }), "convex");

    // Assert
    expect(gate.ok).toBe(true);
  });

  it("refuses an order the kitchen already confirmed, and says why", () => {
    // Act
    const gate = canConfirmFromDrawer(order({ status: "confirmed" }), "convex");

    // Assert
    expect(gate.ok).toBe(false);
    expect(gate.ok === false && gate.reason).toMatch(/already confirmed/i);
  });

  it("refuses a cancelled order", () => {
    // Act
    const gate = canConfirmFromDrawer(order({ status: "cancelled" }), "convex");

    // Assert
    expect(gate.ok).toBe(false);
  });

  it("refuses on a backend that cannot write orders, rather than failing at the tap", () => {
    // Arrange — per-tenant Supabase projects are read-only to this app.
    const gate = canConfirmFromDrawer(order({ status: "pending" }), "supabase");

    // Assert
    expect(gate.ok).toBe(false);
    expect(gate.ok === false && gate.reason).toMatch(/backend/i);
  });

  it("allows confirming on the shared platform backend", () => {
    // Act
    const gate = canConfirmFromDrawer(order({ status: "pending" }), "platform");

    // Assert
    expect(gate.ok).toBe(true);
  });
});
