import { allocateBillPayment } from "./bill-allocate";
import { ROUND_ONE, ROUND_TWO } from "./bill-fixtures";

describe("allocateBillPayment", () => {
  it("settles the oldest order first", () => {
    const result = allocateBillPayment([ROUND_TWO, ROUND_ONE], 400);

    expect(result.allocations).toEqual([
      { orderId: "order-a", amount: 340 },
      { orderId: "order-b", amount: 60 },
    ]);
    expect(result.unallocated).toBe(0);
  });

  it("skips orders that are already paid", () => {
    const result = allocateBillPayment([{ ...ROUND_ONE, amountPaid: 340 }, ROUND_TWO], 100);

    expect(result.allocations).toEqual([{ orderId: "order-b", amount: 100 }]);
  });

  it("fills a guest's own orders first when the split says whose they are", () => {
    const result = allocateBillPayment([ROUND_ONE, ROUND_TWO], 150, { "order-b": 15000 });

    expect(result.allocations).toEqual([{ orderId: "order-b", amount: 150 }]);
  });

  it("caps a preferred order at what it still owes and sends the rest to the oldest", () => {
    const result = allocateBillPayment([ROUND_ONE, { ...ROUND_TWO, amountPaid: 200 }], 50, {
      "order-b": 5000,
    });

    expect(result.allocations).toEqual([
      { orderId: "order-b", amount: 20 },
      { orderId: "order-a", amount: 30 },
    ]);
  });

  it("reports what could not be placed instead of over-collecting", () => {
    const result = allocateBillPayment([ROUND_ONE], 400);

    expect(result.allocations).toEqual([{ orderId: "order-a", amount: 340 }]);
    expect(result.unallocated).toBe(60);
  });

  it("works in centavos so no payment loses one", () => {
    const result = allocateBillPayment([{ ...ROUND_ONE, total: 0.3 }, { ...ROUND_TWO, total: 0.1 }], 0.1 + 0.2);

    expect(result.allocations).toEqual([{ orderId: "order-a", amount: 0.3 }]);
  });
});
