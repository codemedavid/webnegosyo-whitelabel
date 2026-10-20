import { keepOwedStock, owedStockSale } from "./owed-stock";
import { nextStockRetryAt, owesOnlyStock, type QueuedSale } from "./order-outbox";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

function baseSale(): Omit<QueuedSale, "attempts" | "lastError"> {
  return {
    localId: "local-1",
    tenantId: "tenant-1",
    backend: "convex",
    clientOrderId: "pos-local-1",
    createdAt: 1000,
    orderArgs: { total: 10 },
    bookkeeping: {
      stockItems: [{ menuItemId: "m", quantity: 1, optionIds: [], addonIds: [] }],
      loyverseLines: [],
      discountLines: [],
      outletId: null,
      total: 10,
      customerName: "",
      customerContact: "",
      customerData: {},
      channel: null,
      captureItems: [],
    },
    paidAtTender: true,
  };
}

describe("keepOwedStock", () => {
  it("hands a live sale whose stock call failed to the outbox, owing only the stock", async () => {
    // Arrange
    const enqueue = jest.fn().mockResolvedValue("local-1");

    // Act
    await keepOwedStock({ outcome: { stock: "retry" }, sale: baseSale(), orderId: "k-1" }, { enqueue, now: () => 5_000 });

    // Assert
    const queued: QueuedSale = enqueue.mock.calls[0][0];
    expect(queued).toMatchObject({ syncedOrderId: "k-1", reportsDone: true, stockAttempts: 1, attempts: 0 });
    expect(queued.stockRetryAt).toBe(nextStockRetryAt(5_000, 1));
    expect(owesOnlyStock(queued)).toBe(true);
  });

  it.each(["ok", "permanent"] as const)("keeps nothing when the stock call answered %s", async (stock) => {
    const enqueue = jest.fn();
    await keepOwedStock({ outcome: { stock }, sale: baseSale(), orderId: "k-1" }, { enqueue });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("never throws when the hand-off cannot be saved", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const enqueue = jest.fn().mockRejectedValue(new Error("disk full"));
    await expect(
      keepOwedStock({ outcome: { stock: "retry" }, sale: baseSale(), orderId: "k-1" }, { enqueue }),
    ).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("never mutates the sale it was given", () => {
    const sale = baseSale();
    const snapshot = JSON.stringify(sale);
    owedStockSale(sale, "k-1", 0);
    expect(JSON.stringify(sale)).toBe(snapshot);
  });
});
