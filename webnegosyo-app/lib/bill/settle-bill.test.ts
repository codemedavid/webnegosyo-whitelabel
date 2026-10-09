import { settleBill } from "./settle-bill";
import { ROUND_ONE, ROUND_TWO } from "./bill-fixtures";

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
