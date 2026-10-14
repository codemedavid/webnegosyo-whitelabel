/**
 * Handing an order over settles it, and a handed-over order stays handed over.
 *
 * Two merchant reports behind these tests: an order marked Delivered kept its
 * red "Unpaid" chip (nothing ever wrote the payment side), and a delivered
 * order could still be cancelled — pulling food the customer already has out
 * of revenue and putting its ingredients back on the shelf.
 */
import {
  canUserCancelOrder,
  markPaidAfterHandover,
  planOrderStatusChange,
} from "./order-status-change";

describe("planOrderStatusChange — cancelling", () => {
  it("refuses to cancel an order that was already delivered", () => {
    // Arrange
    const order = { status: "delivered", paymentStatus: "paid" };

    // Act
    const plan = planOrderStatusChange(order, "cancelled");

    // Assert
    expect(plan.allowed).toBe(false);
    expect(plan.reason).toMatch(/delivered/i);
  });

  it("refuses to cancel an order twice", () => {
    expect(planOrderStatusChange({ status: "cancelled" }, "cancelled").allowed).toBe(false);
  });

  it.each(["pending", "confirmed", "preparing", "ready"])(
    "still lets a %s order be cancelled",
    (status) => {
      const plan = planOrderStatusChange({ status, paymentStatus: "pending" }, "cancelled");
      expect(plan).toEqual({ allowed: true, shouldMarkPaid: false });
    },
  );
});

describe("planOrderStatusChange — delivering", () => {
  it("marks an unpaid order paid when it is delivered", () => {
    // Arrange
    const order = { status: "ready", paymentStatus: "pending" };

    // Act
    const plan = planOrderStatusChange(order, "delivered");

    // Assert
    expect(plan).toEqual({ allowed: true, shouldMarkPaid: true });
  });

  it("marks paid when the order carries no payment status at all", () => {
    expect(planOrderStatusChange({ status: "ready" }, "delivered").shouldMarkPaid).toBe(true);
  });

  it.each(["paid", "verified"])("leaves an already-%s order's status alone", (paymentStatus) => {
    expect(
      planOrderStatusChange({ status: "ready", paymentStatus }, "delivered").shouldMarkPaid,
    ).toBe(false);
  });

  it("does not settle a table order — serving a table is not the bill", () => {
    // Arrange — dine-in tabs are paid at the end of the seating, and the
    // floor plan reads a served-but-unpaid table as "billing".
    const order = {
      status: "ready",
      paymentStatus: "pending",
      customerData: { table_number: "Table 4" },
    };

    // Act
    const plan = planOrderStatusChange(order, "delivered");

    // Assert
    expect(plan).toEqual({ allowed: true, shouldMarkPaid: false });
  });

  it.each(["confirmed", "preparing", "ready"])(
    "does not touch payment when moving to %s",
    (next) => {
      expect(
        planOrderStatusChange({ status: "pending", paymentStatus: "pending" }, next)
          .shouldMarkPaid,
      ).toBe(false);
    },
  );
});

describe("markPaidAfterHandover", () => {
  it("writes paid on the delivered order", async () => {
    // Arrange
    const write = jest.fn().mockResolvedValue(undefined);

    // Act
    await markPaidAfterHandover(write, "order-1");

    // Assert
    expect(write).toHaveBeenCalledWith({ orderId: "order-1", paymentStatus: "paid" });
  });

  it("never turns a failed payment write into a failed delivery", async () => {
    // Arrange
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const write = jest.fn().mockRejectedValue(new Error("offline"));

    // Act + Assert
    await expect(markPaidAfterHandover(write, "order-1")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("canUserCancelOrder — who may cancel", () => {
  const cashier = { role: "admin", isOwner: false, permissions: ["pos"] };
  const queueStaff = { role: "admin", isOwner: false, permissions: ["orders"] };
  const kitchenOnly = { role: "admin", isOwner: false, permissions: ["kitchen", "tables"] };
  const owner = { role: "admin", isOwner: true, permissions: ["pos"] };
  const fullAccess = { role: "admin", isOwner: false, permissions: null };

  it("hides Cancel from staff without the Orders permission", () => {
    expect(canUserCancelOrder(cashier, "pending")).toBe(false);
    // The pass and the floor are carved OUT of orders; they do not reach back.
    expect(canUserCancelOrder(kitchenOnly, "confirmed")).toBe(false);
  });

  it("shows Cancel to Orders holders, owners and full-access accounts", () => {
    expect(canUserCancelOrder(queueStaff, "pending")).toBe(true);
    expect(canUserCancelOrder(owner, "ready")).toBe(true);
    expect(canUserCancelOrder(fullAccess, "preparing")).toBe(true);
  });

  it("still refuses a delivered or cancelled order, whoever asks", () => {
    expect(canUserCancelOrder(owner, "delivered")).toBe(false);
    expect(canUserCancelOrder(owner, "cancelled")).toBe(false);
  });
});
