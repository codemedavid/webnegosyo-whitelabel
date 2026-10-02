/**
 * The order screen's payment flow, driven through the hook with every write
 * injected. What is under test is the ORDER of things: money is recorded
 * before the status that depends on it, and a part payment never marks an
 * order delivered (delivery settles an order, which would hide the rest).
 */
import { act, renderHook } from "@testing-library/react-native";
import { useOrderPaymentFlow, type OrderPaymentFlowInput } from "./use-order-payment-flow";

const CASH = { id: "cash", name: "Cash", isCash: true };

function setup(overrides: Partial<OrderPaymentFlowInput> = {}) {
  const calls: string[] = [];
  const advance = jest.fn(async (status: string) => {
    calls.push(`status:${status}`);
    return true;
  });
  const recordPayment = jest.fn(async (args: Record<string, unknown>) => {
    calls.push(`ledger:${args.amount}`);
  });
  const updatePaymentStatus = jest.fn(async (args: { paymentStatus: string }) => {
    calls.push(`payment:${args.paymentStatus}`);
  });
  const printBill = jest.fn();
  const alert = jest.fn();
  const input: OrderPaymentFlowInput = {
    order: {
      _id: "order-1",
      status: "pending",
      total: 450,
      paymentStatus: "pending",
      paymentMethod: "GCash",
      customerData: { payment_proof_reference: "GC-77" },
    },
    balanceDue: 450,
    isUnpaid: true,
    collectGate: { allowed: true },
    methods: [CASH],
    isDemo: false,
    userId: "user-1",
    advance,
    recordPayment,
    updatePaymentStatus,
    printBill,
    alert,
    ...overrides,
  };
  const hook = renderHook(() => useOrderPaymentFlow(input));
  return { hook, calls, advance, recordPayment, updatePaymentStatus, printBill, alert };
}

describe("confirming an unpaid web order", () => {
  it("asks before confirming", () => {
    const { hook, advance } = setup();
    act(() => hook.result.current.requestStatusChange("confirmed"));
    expect(hook.result.current.decisionSheet.visible).toBe(true);
    expect(hook.result.current.decisionSheet.summary.reference).toBe("GC-77");
    expect(advance).not.toHaveBeenCalled();
  });

  it("confirm only: moves the order and leaves it unpaid", async () => {
    const { hook, calls } = setup();
    act(() => hook.result.current.requestStatusChange("confirmed"));
    await act(async () => hook.result.current.decisionSheet.onUnpaid());
    expect(calls).toEqual(["status:confirmed"]);
    expect(hook.result.current.decisionSheet.visible).toBe(false);
  });

  it("payment received by GCash: confirms, then marks paid, with no ledger row", async () => {
    const { hook, calls } = setup();
    act(() => hook.result.current.requestStatusChange("confirmed"));
    await act(async () => hook.result.current.decisionSheet.onPaid());
    expect(calls).toEqual(["status:confirmed", "payment:paid"]);
  });

  it("payment received in cash: opens the cash pad, records the money, THEN confirms", async () => {
    const { hook, calls, recordPayment } = setup({
      order: { _id: "order-1", status: "pending", total: 450, paymentStatus: "pending", paymentMethod: "Cash" },
    });
    act(() => hook.result.current.requestStatusChange("confirmed"));
    await act(async () => hook.result.current.decisionSheet.onPaid());
    expect(hook.result.current.collectSheet.visible).toBe(true);
    expect(hook.result.current.collectSheet.submitLabel).toBe("Record payment & confirm");

    await act(async () =>
      hook.result.current.collectSheet.onSubmit({
        amount: 450,
        methodId: "cash",
        methodName: "Cash",
        cashTendered: 500,
        changeDue: 50,
      }),
    );
    expect(calls).toEqual(["ledger:450", "payment:paid", "status:confirmed"]);
    expect(recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ note: "Cash received ₱500.00 · change ₱50.00" }),
    );
  });

  it("explains, rather than offers, a cash collection this person cannot make", () => {
    const { hook } = setup({
      order: { _id: "order-1", status: "pending", total: 450, paymentStatus: "pending", paymentMethod: "Cash" },
      collectGate: { allowed: false, reason: "You do not have permission to take payments." },
    });
    act(() => hook.result.current.requestStatusChange("confirmed"));
    expect(hook.result.current.decisionSheet.paidDisabledReason).toBe(
      "You do not have permission to take payments.",
    );
  });

  it("confirms a paid order without asking", () => {
    const { hook, advance } = setup({ isUnpaid: false });
    act(() => hook.result.current.requestStatusChange("confirmed"));
    expect(hook.result.current.decisionSheet.visible).toBe(false);
    expect(advance).toHaveBeenCalledWith("confirmed");
  });
});

describe("handing over an unpaid order", () => {
  const readyOrder = {
    _id: "order-1",
    status: "ready",
    total: 450,
    paymentStatus: "pending",
    customerData: { pos: { payLater: true } },
  };

  it("collects in full, then marks delivered", async () => {
    const { hook, calls, printBill } = setup({ order: readyOrder });
    act(() => hook.result.current.requestStatusChange("delivered"));
    await act(async () => hook.result.current.decisionSheet.onPaid());
    await act(async () =>
      hook.result.current.collectSheet.onSubmit({ amount: 450, cashTendered: 500, changeDue: 50 }),
    );
    expect(calls).toEqual(["ledger:450", "payment:paid", "status:delivered"]);
    expect(printBill).toHaveBeenCalled();
  });

  it("never marks delivered after a part payment", async () => {
    const { hook, calls, alert } = setup({ order: readyOrder });
    act(() => hook.result.current.requestStatusChange("delivered"));
    await act(async () => hook.result.current.decisionSheet.onPaid());
    await act(async () => hook.result.current.collectSheet.onSubmit({ amount: 200 }));
    expect(calls).toEqual(["ledger:200"]);
    expect(alert).toHaveBeenCalledWith("Part payment recorded", expect.any(String));
  });

  it("already paid: delivers straight away", async () => {
    const { hook, calls } = setup({ order: readyOrder });
    act(() => hook.result.current.requestStatusChange("delivered"));
    await act(async () => hook.result.current.decisionSheet.onUnpaid());
    expect(calls).toEqual(["status:delivered"]);
  });
});

describe("collecting on its own", () => {
  it("records the payment and moves no status", async () => {
    const { hook, calls } = setup();
    act(() => hook.result.current.openCollect());
    await act(async () => hook.result.current.collectSheet.onSubmit({ amount: 450 }));
    expect(calls).toEqual(["ledger:450", "payment:paid"]);
    expect(hook.result.current.collectSheet.visible).toBe(false);
  });

  it("keeps the sheet open and says so when the payment is refused", async () => {
    const { hook, alert, updatePaymentStatus, recordPayment } = setup();
    recordPayment.mockRejectedValueOnce(new Error("offline"));
    act(() => hook.result.current.openCollect());
    await act(async () => hook.result.current.collectSheet.onSubmit({ amount: 450 }));
    expect(alert).toHaveBeenCalledWith("Could not record the payment", "offline");
    expect(updatePaymentStatus).not.toHaveBeenCalled();
    expect(hook.result.current.collectSheet.visible).toBe(true);
  });

  it("refuses in demo mode", () => {
    const { hook, alert } = setup({ isDemo: true });
    act(() => hook.result.current.openCollect());
    expect(alert).toHaveBeenCalledWith("Demo mode", expect.any(String));
    expect(hook.result.current.collectSheet.visible).toBe(false);
  });
});
