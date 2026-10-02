import {
  confirmPaidRoute,
  paymentPromptCopy,
  paymentPromptFor,
} from "./order-payment-prompt";

const webOrder: { status: string; customerData?: unknown } & Record<string, unknown> = {
  status: "pending",
  paymentStatus: "pending",
  total: 450,
  customerData: {},
};

describe("paymentPromptFor", () => {
  it("asks about payment when confirming an unpaid order", () => {
    expect(paymentPromptFor(webOrder, "confirmed", { isUnpaid: true })).toBe("confirm");
  });

  it("confirms an order that is already paid without asking", () => {
    expect(paymentPromptFor({ ...webOrder, paymentStatus: "paid" }, "confirmed", { isUnpaid: false })).toBe(
      "none",
    );
  });

  it("asks before an unpaid order is handed over — delivering it would otherwise mark it paid silently", () => {
    expect(
      paymentPromptFor({ ...webOrder, status: "ready" }, "delivered", { isUnpaid: true }),
    ).toBe("handover");
  });

  it("does not ask when a table is served — its bill is settled at the end", () => {
    const tableOrder = { ...webOrder, status: "ready", customerData: { table_number: "4" } };
    expect(paymentPromptFor(tableOrder, "delivered", { isUnpaid: true })).toBe("none");
  });

  it("never asks on the steps in between, or on a cancel", () => {
    expect(paymentPromptFor(webOrder, "preparing", { isUnpaid: true })).toBe("none");
    expect(paymentPromptFor(webOrder, "cancelled", { isUnpaid: true })).toBe("none");
  });
});

describe("confirmPaidRoute", () => {
  it("opens the cash pad for a cash order, so the change is worked out", () => {
    expect(confirmPaidRoute("Cash on pickup")).toBe("collect");
    expect(confirmPaidRoute("COD")).toBe("collect");
  });

  it("opens the collect sheet when the order carries no method at all", () => {
    expect(confirmPaidRoute(undefined)).toBe("collect");
  });

  it("marks an online payment paid in one tap — the merchant is verifying it, not taking cash", () => {
    expect(confirmPaidRoute("GCash")).toBe("mark-paid");
    expect(confirmPaidRoute("Bank transfer")).toBe("mark-paid");
  });
});

describe("paymentPromptCopy", () => {
  it("words the confirm choice around the order's own method", () => {
    const copy = paymentPromptCopy("confirm", { amount: 450, methodName: "GCash" });
    expect(copy.title).toBe("Confirm this order");
    expect(copy.question).toBe("Has the customer paid ₱450.00?");
    expect(copy.paid).toEqual({
      label: "Yes — payment received",
      description: "Confirm the order and mark ₱450.00 paid by GCash.",
    });
    expect(copy.unpaid).toEqual({
      label: "Not yet — confirm order only",
      description: "The order stays Unpaid. Collect ₱450.00 at pickup or delivery.",
    });
  });

  it("tells a cash confirm that the cash and change come next", () => {
    expect(paymentPromptCopy("confirm", { amount: 450, methodName: "Cash" }).paid.description).toBe(
      "Enter the cash received and the change, then confirm the order.",
    );
  });

  it("words the handover choice as collecting the balance", () => {
    const copy = paymentPromptCopy("handover", { amount: 200, methodName: undefined });
    expect(copy.title).toBe("₱200.00 is still unpaid");
    expect(copy.paid).toEqual({
      label: "Collect ₱200.00 now",
      description: "Enter the payment, then mark the order delivered.",
    });
    expect(copy.unpaid).toEqual({
      label: "Already paid — mark delivered",
      description: "Use this if the money was taken some other way. The order is marked paid.",
    });
  });
});
