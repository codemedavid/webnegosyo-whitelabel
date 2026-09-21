import { loyverseOrderNumber, runPosSaleBookkeeping, type PosSaleBookkeepingDeps } from "./pos-sale-bookkeeping";

describe("runPosSaleBookkeeping", () => {
  const deps: jest.Mocked<PosSaleBookkeepingDeps> = {
    stock: jest.fn().mockResolvedValue(undefined),
    loyverse: jest.fn().mockResolvedValue(undefined),
    vouchers: jest.fn().mockResolvedValue(undefined),
    activity: jest.fn().mockResolvedValue(undefined),
    capture: jest.fn().mockResolvedValue(undefined),
  };

  it("reports the sale to every ledger with the id it was written under and the time it was taken", async () => {
    await runPosSaleBookkeeping(
      {
        tenantId: "t",
        orderId: "abcdef123456",
        backend: "convex",
        createdAt: Date.UTC(2026, 8, 21, 4, 0, 0),
        bookkeeping: {
          stockItems: [{ menuItemId: "m", quantity: 1, optionIds: [], addonIds: [] }],
          loyverseLines: [{ menu_item_id: "m", menu_item_name: "Latte", quantity: 1, price: 100 } as never],
          discountLines: [],
          outletId: "o",
          total: 100,
          customerName: "Ana",
          customerContact: "0917",
          customerData: { pos: {} },
          channel: "Dine-in",
          captureItems: [{ name: "Latte", quantity: 1 }],
        },
      },
      deps
    );

    expect(deps.stock).toHaveBeenCalledWith("t", "abcdef123456", expect.any(Array));
    expect(deps.loyverse).toHaveBeenCalledWith("t", "123456", expect.any(Array));
    expect(deps.vouchers).toHaveBeenCalledWith("t", "abcdef123456", [], "o");
    expect(deps.activity).toHaveBeenCalledWith("t", {
      backend: "convex",
      orderId: "abcdef123456",
      total: 100,
      outletId: "o",
    });
    expect(deps.capture).toHaveBeenCalledWith(
      "t",
      expect.objectContaining({
        orderId: "abcdef123456",
        name: "Ana",
        contact: "0917",
        createdAt: "2026-09-21T04:00:00.000Z",
        channel: "Dine-in",
      })
    );
  });

  it("uses the same short Loyverse reference the tender screen always did", () => {
    expect(loyverseOrderNumber("k17abcxyz")).toBe("ABCXYZ");
  });
});
