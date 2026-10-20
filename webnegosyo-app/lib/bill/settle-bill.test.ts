import { settleBill, settleBillTenders } from "./settle-bill";
import { ROUND_ONE, ROUND_TWO, billOrder } from "./bill-fixtures";

function harness(failOn?: string) {
  const recorded: Record<string, unknown>[] = [];
  const markedPaid: string[] = [];
  return {
    recorded,
    markedPaid,
    deps: {
      recordPayment: async (args: Record<string, unknown>) => {
        if (args.orderId === failOn) throw new Error("network down");
        recorded.push(args);
      },
      markPaid: async (orderId: string) => {
        markedPaid.push(orderId);
      },
    },
  };
}

const cash = { amount: 400, methodId: "m-cash", methodName: "Cash", cashTendered: 500, changeDue: 100 };

describe("settleBill", () => {
  it("records one ledger row per order the payment settles, oldest first", async () => {
    const { recorded, deps } = harness();

    const result = await settleBill({ orders: [ROUND_ONE, ROUND_TWO], payment: cash, billTitle: "Table 4", ...deps });

    expect(recorded.map((row) => [row.orderId, row.amount])).toEqual([
      ["order-a", 340],
      ["order-b", 60],
    ]);
    expect(result.recordedCents).toBe(40000);
    expect(result.failure).toBeNull();
  });

  it("notes the cash and change once, and names the bill on every row", async () => {
    const { recorded, deps } = harness();

    await settleBill({ orders: [ROUND_ONE, ROUND_TWO], payment: cash, billTitle: "Table 4", ...deps });

    expect(recorded[0].note).toBe("Cash received ₱500.00 · change ₱100.00 · Table 4 bill");
    expect(recorded[1].note).toBe("Table 4 bill");
    expect(recorded.every((row) => row.kind === "charge" && row.paymentMethodName === "Cash")).toBe(true);
  });

  it("marks paid only the orders the payment squares", async () => {
    const { markedPaid, deps } = harness();

    await settleBill({ orders: [ROUND_ONE, ROUND_TWO], payment: cash, billTitle: "Table 4", ...deps });

    expect(markedPaid).toEqual(["order-a"]);
  });

  it("refuses a payment bigger than the bill before recording anything", async () => {
    const { recorded, deps } = harness();

    await expect(
      settleBill({ orders: [ROUND_ONE], payment: { amount: 400 }, billTitle: "Table 4", ...deps }),
    ).rejects.toThrow("Only ₱340.00 is still owed on this bill.");
    expect(recorded).toHaveLength(0);
  });

  it("stops at the first failed write and reports what did go through", async () => {
    const { recorded, deps } = harness("order-b");

    const result = await settleBill({ orders: [ROUND_ONE, ROUND_TWO], payment: cash, billTitle: "Table 4", ...deps });

    expect(recorded).toHaveLength(1);
    expect(result.recordedCents).toBe(34000);
    expect(result.failure).toEqual({ orderId: "order-b", message: "network down" });
  });

  it("does not treat a failed paid flag as a failed payment", async () => {
    const { deps } = harness();
    const result = await settleBill({
      orders: [ROUND_ONE],
      payment: { amount: 340 },
      billTitle: "Table 4",
      ...deps,
      markPaid: async () => {
        throw new Error("status write refused");
      },
    });

    expect(result.recordedCents).toBe(34000);
    expect(result.failure).toBeNull();
  });
});

describe("settleBillTenders", () => {
  const gcash = { amount: 120, methodId: "m-gcash", methodName: "GCash", reference: "GC-1" };
  const rest = { amount: 440, methodId: "m-cash", methodName: "Cash", cashTendered: 500, changeDue: 60 };

  it("records each method as its own rows, spreading the second over what the first left", async () => {
    const { recorded, deps } = harness();

    const result = await settleBillTenders({
      orders: [ROUND_ONE, ROUND_TWO],
      payments: [gcash, rest],
      billTitle: "Table 4",
      ...deps,
    });

    expect(recorded.map((row) => [row.orderId, row.amount, row.paymentMethodName])).toEqual([
      ["order-a", 120, "GCash"],
      ["order-a", 220, "Cash"],
      ["order-b", 220, "Cash"],
    ]);
    expect(recorded[0].reference).toBe("GC-1");
    expect(recorded[1].note).toBe("Cash received ₱500.00 · change ₱60.00 · Table 4 bill");
    expect(result).toEqual({ recordedCents: 56000, recorded: [gcash, rest], failure: null });
  });

  it("marks each order paid once, when the method that squares it lands", async () => {
    const { markedPaid, deps } = harness();

    await settleBillTenders({ orders: [ROUND_ONE, ROUND_TWO], payments: [gcash, rest], billTitle: "Table 4", ...deps });

    expect(markedPaid).toEqual(["order-a", "order-b"]);
  });

  it("refuses methods that together exceed the bill before recording anything", async () => {
    const { recorded, deps } = harness();

    await expect(
      settleBillTenders({ orders: [ROUND_ONE], payments: [gcash, rest], billTitle: "Table 4", ...deps }),
    ).rejects.toThrow("Only ₱340.00 is still owed on this bill.");
    expect(recorded).toHaveLength(0);
  });

  it("keeps a by-item share on its own orders across both methods", async () => {
    const { recorded, deps } = harness();
    const preferred = { "order-b": 15000 };

    await settleBillTenders({
      orders: [ROUND_ONE, ROUND_TWO],
      payments: [{ amount: 100, methodName: "GCash" }, { amount: 50, methodName: "Cash" }],
      preferred,
      billTitle: "Table 4",
      ...deps,
    });

    expect(recorded.map((row) => [row.orderId, row.amount, row.paymentMethodName])).toEqual([
      ["order-b", 100, "GCash"],
      ["order-b", 50, "Cash"],
    ]);
  });

  it("stops at the first failed write and reports only the methods that went through", async () => {
    const { deps } = harness("order-b");

    const result = await settleBillTenders({
      orders: [ROUND_ONE, ROUND_TWO],
      payments: [gcash, rest],
      billTitle: "Table 4",
      ...deps,
    });

    expect(result.recordedCents).toBe(34000);
    expect(result.recorded).toEqual([gcash, { amount: 220, methodId: "m-cash", methodName: "Cash" }]);
    expect(result.failure).toEqual({ orderId: "order-b", message: "network down" });
  });

  it("settles a single payment exactly as settleBill does", async () => {
    const order = billOrder({ _id: "solo", total: 300 });
    const { recorded, deps } = harness();

    const result = await settleBillTenders({ orders: [order], payments: [{ amount: 300, methodName: "Cash" }], billTitle: "Table 1", ...deps });

    expect(recorded).toHaveLength(1);
    expect(result.recordedCents).toBe(30000);
  });
});
