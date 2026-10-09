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
});
