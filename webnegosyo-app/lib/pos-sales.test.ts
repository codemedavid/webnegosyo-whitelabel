/**
 * Drawer reconciliation, including online orders confirmed at the register.
 *
 * The money rule under test: an online order contributes its SETTLED amount to
 * the drawer, never its `total`. A confirmed-but-unpaid Smart Menu order is
 * real sales but no cash in the till, and a cashier counting the drawer must
 * not be told to expect money the customer has not handed over.
 */

import { summarizeCounterSales, type CounterSale, type CounterPayment } from "./pos-sales";

function posSale(overrides: Partial<CounterSale> = {}): CounterSale {
  return {
    _id: "pos-1",
    _creationTime: 1_000,
    source: "pos",
    status: "delivered",
    total: 100,
    paymentMethod: "Cash",
    ...overrides,
  };
}

function onlineOrder(overrides: Partial<CounterSale> = {}): CounterSale {
  return {
    _id: "web-1",
    _creationTime: 2_000,
    source: "web",
    status: "confirmed",
    total: 250,
    paymentMethod: "Cash",
    amountPaid: 250,
    ...overrides,
  };
}

describe("summarizeCounterSales — existing counter-sale behaviour", () => {
  it("ignores online orders when no source policy is given", () => {
    // Arrange
    const orders = [posSale(), onlineOrder()];

    // Act
    const summary = summarizeCounterSales(orders);

    // Assert
    expect(summary.saleCount).toBe(1);
    expect(summary.grossTotal).toBe(100);
    expect(summary.cashTotal).toBe(100);
  });

  it("still splits a POS sale by its settlement ledger when rows exist", () => {
    // Arrange
    const orders = [posSale({ total: 300, paymentMethod: "GCash" })];
    const payments: CounterPayment[] = [
      { orderId: "pos-1", kind: "charge", amount: 200, paymentMethodName: "GCash" },
      { orderId: "pos-1", kind: "charge", amount: 100, paymentMethodName: "Cash" },
    ];

    // Act
    const summary = summarizeCounterSales(orders, payments);

    // Assert
    expect(summary.cashTotal).toBe(100);
    expect(summary.nonCashTotal).toBe(200);
  });
});

describe("summarizeCounterSales — online orders confirmed at the register", () => {
  it("counts a confirmed online order that was paid in cash", () => {
    // Arrange
    const orders = [onlineOrder({ amountPaid: 250, paymentMethod: "Cash" })];

    // Act
    const summary = summarizeCounterSales(orders, [], { includeOnlineOrders: true });

    // Assert
    expect(summary.saleCount).toBe(1);
    expect(summary.grossTotal).toBe(250);
    expect(summary.cashTotal).toBe(250);
  });

  it("adds nothing to the drawer for a confirmed online order nobody has paid yet", () => {
    // Arrange — the kitchen accepted it; the customer pays on delivery.
    const orders = [onlineOrder({ amountPaid: 0 })];

    // Act
    const summary = summarizeCounterSales(orders, [], { includeOnlineOrders: true });

    // Assert
    expect(summary.saleCount).toBe(1);
    expect(summary.grossTotal).toBe(250);
    expect(summary.cashTotal).toBe(0);
    expect(summary.nonCashTotal).toBe(0);
  });

  it("treats a missing amountPaid as unpaid rather than as the full total", () => {
    // Arrange — a Convex tenant that has never recorded a settlement row.
    const orders = [onlineOrder({ amountPaid: undefined })];

    // Act
    const summary = summarizeCounterSales(orders, [], { includeOnlineOrders: true });

    // Assert
    expect(summary.cashTotal).toBe(0);
  });

  it("routes a non-cash online payment to the non-cash column", () => {
    // Arrange
    const orders = [onlineOrder({ paymentMethod: "GCash", amountPaid: 250 })];

    // Act
    const summary = summarizeCounterSales(orders, [], { includeOnlineOrders: true });

    // Assert
    expect(summary.cashTotal).toBe(0);
    expect(summary.nonCashTotal).toBe(250);
  });

  it("excludes an online order still waiting to be confirmed", () => {
    // Arrange — it is not the register's money until the register accepts it.
    const orders = [onlineOrder({ status: "pending", amountPaid: 250 })];

    // Act
    const summary = summarizeCounterSales(orders, [], { includeOnlineOrders: true });

    // Assert
    expect(summary.saleCount).toBe(0);
    expect(summary.cashTotal).toBe(0);
  });

  it("excludes a cancelled online order even when money was recorded against it", () => {
    // Arrange
    const orders = [onlineOrder({ status: "cancelled", amountPaid: 250 })];

    // Act
    const summary = summarizeCounterSales(orders, [], { includeOnlineOrders: true });

    // Assert
    expect(summary.saleCount).toBe(0);
    expect(summary.cashTotal).toBe(0);
  });

  it("prefers the settlement ledger over amountPaid when rows exist", () => {
    // Arrange — half the online bill was topped up in cash at the counter.
    const orders = [onlineOrder({ paymentMethod: "GCash", amountPaid: 250 })];
    const payments: CounterPayment[] = [
      { orderId: "web-1", kind: "charge", amount: 150, paymentMethodName: "GCash" },
      { orderId: "web-1", kind: "charge", amount: 100, paymentMethodName: "Cash" },
    ];

    // Act
    const summary = summarizeCounterSales(orders, payments, { includeOnlineOrders: true });

    // Assert
    expect(summary.cashTotal).toBe(100);
    expect(summary.nonCashTotal).toBe(150);
  });

  it("keeps counter sales and confirmed online orders in the same totals", () => {
    // Arrange
    const orders = [
      posSale({ total: 100, paymentMethod: "Cash" }),
      onlineOrder({ total: 250, paymentMethod: "Cash", amountPaid: 250 }),
    ];

    // Act
    const summary = summarizeCounterSales(orders, [], { includeOnlineOrders: true });

    // Assert
    expect(summary.saleCount).toBe(2);
    expect(summary.grossTotal).toBe(350);
    expect(summary.cashTotal).toBe(350);
  });
});
