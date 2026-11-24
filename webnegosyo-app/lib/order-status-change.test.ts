/**
 * A status change never invents a payment, and a handed-over order stays
 * handed over.
 *
 * Merchant reports behind these tests: a delivered order could still be
 * cancelled (food the customer has, pulled out of revenue); and — Koko Coffee
 * 2026-11-24 — handing over a pay-later order wrote `paid` with no method and
 * no ledger row, so ₱1,610 sat under "Paid, method not picked" and cash + GCash
 * never matched sales. Only a ledger that already holds the bill may mark it.
 */
import {
  canUserCancelOrder,
  planOrderStatusChange,
  syncPaidAfterHandover,
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
      expect(plan).toEqual({ allowed: true, shouldSyncPaid: false });
    },
  );
});

describe("planOrderStatusChange — delivering", () => {
  it("never marks an unrecorded bill paid when it is delivered", () => {
    // Arrange — a register "pay later" sale: no method, nothing on the ledger.
    const order = { status: "ready", paymentStatus: "pending", total: 560, amountPaid: 0 };

    // Act
    const plan = planOrderStatusChange(order, "delivered");

    // Assert
    expect(plan).toEqual({ allowed: true, shouldSyncPaid: false });
  });

  it("does not guess when the screen holds no ledger", () => {
    expect(planOrderStatusChange({ status: "ready", paymentStatus: "pending", total: 560 }, "delivered").shouldSyncPaid).toBe(false);
    expect(planOrderStatusChange({ status: "ready" }, "delivered").shouldSyncPaid).toBe(false);
  });

  it("catches the row up when the ledger already holds the whole bill", () => {
    const order = { status: "ready", paymentStatus: "pending", total: 560, amountPaid: 560 };
    expect(planOrderStatusChange(order, "delivered").shouldSyncPaid).toBe(true);
  });

  it("leaves a part-paid bill unpaid", () => {
    const order = { status: "ready", paymentStatus: "pending", total: 560, amountPaid: 200 };
    expect(planOrderStatusChange(order, "delivered").shouldSyncPaid).toBe(false);
  });

  it.each(["paid", "verified"])("leaves an already-%s order's status alone", (paymentStatus) => {
    expect(
      planOrderStatusChange({ status: "ready", paymentStatus, total: 100, amountPaid: 100 }, "delivered").shouldSyncPaid,
    ).toBe(false);
  });

  it("does not settle a table order — serving a table is not the bill", () => {
    // Arrange — dine-in tabs are paid at the end of the seating, and the
    // floor plan reads a served-but-unpaid table as "billing".
    const order = {
      status: "ready",
      paymentStatus: "pending",
      total: 300,
      amountPaid: 300,
      customerData: { table_number: "Table 4" },
    };

    // Act
    const plan = planOrderStatusChange(order, "delivered");

    // Assert
    expect(plan).toEqual({ allowed: true, shouldSyncPaid: false });
  });

  it.each(["confirmed", "preparing", "ready"])(
    "does not touch payment when moving to %s",
    (next) => {
      expect(
        planOrderStatusChange({ status: "pending", paymentStatus: "pending", total: 100, amountPaid: 100 }, next)
          .shouldSyncPaid,
      ).toBe(false);
    },
  );
});

describe("syncPaidAfterHandover", () => {
  it("writes paid on the delivered order", async () => {
    // Arrange
    const write = jest.fn().mockResolvedValue(undefined);

    // Act
    await syncPaidAfterHandover(write, "order-1");

    // Assert
    expect(write).toHaveBeenCalledWith({ orderId: "order-1", paymentStatus: "paid" });
  });

  it("never turns a failed payment write into a failed delivery", async () => {
    // Arrange
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const write = jest.fn().mockRejectedValue(new Error("offline"));

    // Act + Assert
    await expect(syncPaidAfterHandover(write, "order-1")).resolves.toBeUndefined();
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
