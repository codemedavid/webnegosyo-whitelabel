import { Alert } from "react-native";
import { act, renderHook } from "@testing-library/react-native";
import { useBillCollect, type BillCollectInput } from "./use-bill-collect";
import { billPartViews } from "./bill-parts";
import { EMPTY_PLAN, setGuests, setMode, type BillPlan } from "./bill-plan";
import { ROUND_ONE, ROUND_TWO } from "./bill-fixtures";

const orders = [ROUND_ONE, ROUND_TWO];
const plan = setGuests(setMode(EMPTY_PLAN, "even", 56000), 2);

function setup(overrides: Partial<BillCollectInput> = {}) {
  let latestPlan: BillPlan = plan;
  const input: BillCollectInput = {
    orders,
    billTitle: "Table 4",
    billKey: "order-a,order-b",
    recordPayment: jest.fn(async () => undefined),
    updatePaymentStatus: jest.fn(async () => undefined),
    updatePlan: jest.fn((_key, change) => {
      latestPlan = change(latestPlan);
    }),
    printBillOut: jest.fn(),
    ...overrides,
  };
  const hook = renderHook(() => useBillCollect(input));
  return { input, hook, plan: () => latestPlan };
}

describe("useBillCollect", () => {
  beforeEach(() => jest.spyOn(Alert, "alert").mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it("collects a guest's share, records it on the plan and prints their slip with the change", async () => {
    const { input, hook, plan: currentPlan } = setup();
    const [part] = billPartViews(orders, plan, 0).parts;

    act(() => hook.result.current.open({ kind: "part", part }));
    expect(hook.result.current.balanceDue).toBe(280);
    expect(hook.result.current.title).toBe("Collect · Guest 1");

    await act(() =>
      hook.result.current.submit({ amount: 280, methodName: "Cash", cashTendered: 300, changeDue: 20 }),
    );

    expect(input.recordPayment).toHaveBeenCalledTimes(1);
    expect(currentPlan().paid).toEqual({ "even:0": 28000 });
    const [receipt, options] = (input.printBillOut as jest.Mock).mock.calls[0];
    expect(receipt).toMatchObject({ cashTendered: 300, changeDue: 20, amountPaid: 280, paymentMethod: "Cash" });
    expect(options).toEqual({ printKey: "order-a,order-b:even:0", withQr: false });
    expect(hook.result.current.target).toBeNull();
  });

  it("explains a refused payment and records nothing", async () => {
    const { input, hook } = setup();

    act(() => hook.result.current.open({ kind: "bill" }));
    await act(() => hook.result.current.submit({ amount: 9999 }));

    expect(Alert.alert).toHaveBeenCalledWith("Payment not recorded", "Only ₱560.00 is still owed on this bill.");
    expect(input.recordPayment).not.toHaveBeenCalled();
    expect(input.printBillOut).not.toHaveBeenCalled();
  });

  it("prints no change for a payment only partly recorded, and says what went through", async () => {
    const recordPayment = jest.fn(async (args: Record<string, unknown>) => {
      if (args.orderId === "order-b") throw new Error("offline");
    });
    const { input, hook } = setup({ recordPayment });

    act(() => hook.result.current.open({ kind: "bill" }));
    await act(() => hook.result.current.submit({ amount: 560, cashTendered: 600, changeDue: 40 }));

    const [receipt] = (input.printBillOut as jest.Mock).mock.calls[0];
    expect(receipt.cashTendered).toBeUndefined();
    expect(receipt.amountPaid).toBe(340);
    expect(Alert.alert).toHaveBeenCalledWith("Only part of the payment was recorded", expect.stringContaining("₱340.00"));
  });
  it("records a split tender method by method and prints one slip naming both", async () => {
    const { input, hook } = setup();

    act(() => hook.result.current.open({ kind: "bill" }));
    await act(() =>
      hook.result.current.submitSplit([
        { amount: 120, methodId: "m-gcash", methodName: "GCash", reference: "GC-1" },
        { amount: 440, methodId: "m-cash", methodName: "Cash", cashTendered: 500, changeDue: 60 },
      ]),
    );

    const rows = (input.recordPayment as jest.Mock).mock.calls.map(([args]) => [args.orderId, args.amount, args.paymentMethodName]);
    expect(rows).toEqual([
      ["order-a", 120, "GCash"],
      ["order-a", 220, "Cash"],
      ["order-b", 220, "Cash"],
    ]);
    const [receipt] = (input.printBillOut as jest.Mock).mock.calls[0];
    expect(receipt).toMatchObject({
      paymentMethod: "GCash + Cash",
      paymentReference: "GC-1",
      cashTendered: 500,
      changeDue: 60,
      amountPaid: 560,
    });
    expect(hook.result.current.target).toBeNull();
  });

  it("credits a guest's share with every method of their split", async () => {
    const { hook, plan: currentPlan } = setup();
    const [part] = billPartViews(orders, plan, 0).parts;

    act(() => hook.result.current.open({ kind: "part", part }));
    await act(() =>
      hook.result.current.submitSplit([
        { amount: 100, methodName: "GCash" },
        { amount: 180, methodName: "Cash", cashTendered: 200, changeDue: 20 },
      ]),
    );

    expect(currentPlan().paid).toEqual({ "even:0": 28000 });
  });

  it("refuses a split that adds up to more than is owed and records nothing", async () => {
    const { input, hook } = setup();

    act(() => hook.result.current.open({ kind: "bill" }));
    await act(() => hook.result.current.submitSplit([{ amount: 500, methodName: "GCash" }, { amount: 100, methodName: "Cash" }]));

    expect(Alert.alert).toHaveBeenCalledWith("Payment not recorded", "Only ₱560.00 is still owed on this bill.");
    expect(input.recordPayment).not.toHaveBeenCalled();
  });
});
