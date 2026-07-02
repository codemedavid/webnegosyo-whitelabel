import { selectNewOrders, formatOrderAlertBody, type AlertableOrder } from "./order-alerts-utils";

describe("selectNewOrders", () => {
  const a: AlertableOrder = { _id: "a" };
  const b: AlertableOrder = { _id: "b" };
  const c: AlertableOrder = { _id: "c" };

  it("returns no new orders on the initial snapshot (prevIds null) so the first load never rings", () => {
    // Arrange: first render, nothing seen yet
    const prevIds = null;

    // Act
    const result = selectNewOrders(prevIds, [a, b]);

    // Assert
    expect(result).toEqual([]);
  });

  it("returns only orders whose id was not previously seen", () => {
    // Arrange: a and b already on screen, c just arrived
    const prevIds = new Set(["a", "b"]);

    // Act
    const result = selectNewOrders(prevIds, [a, b, c]);

    // Assert
    expect(result).toEqual([c]);
  });

  it("returns an empty array when no genuinely new orders arrived", () => {
    const prevIds = new Set(["a", "b"]);
    expect(selectNewOrders(prevIds, [a, b])).toEqual([]);
  });

  it("treats an undefined queue as no new orders (query still loading)", () => {
    expect(selectNewOrders(new Set(["a"]), undefined)).toEqual([]);
  });

  it("detects a brand-new pending order even when the previous set was empty", () => {
    // Mirrors a fresh, quiet store receiving its very first order after load.
    expect(selectNewOrders(new Set<string>(), [a])).toEqual([a]);
  });
});

describe("formatOrderAlertBody", () => {
  it("formats name, peso total, and pluralized item count", () => {
    const body = formatOrderAlertBody({ _id: "x", customerName: "Maria", total: 250, itemCount: 3 });
    expect(body).toBe("Maria — ₱250.00 (3 items)");
  });

  it("uses the singular 'item' for a single-item order", () => {
    const body = formatOrderAlertBody({ _id: "x", customerName: "Jose", total: 99.5, itemCount: 1 });
    expect(body).toBe("Jose — ₱99.50 (1 item)");
  });

  it("falls back to sensible defaults when fields are missing", () => {
    const body = formatOrderAlertBody({ _id: "x" });
    expect(body).toBe("Customer — ₱0.00 (0 items)");
  });
});
