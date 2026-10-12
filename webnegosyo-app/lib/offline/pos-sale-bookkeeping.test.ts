import { loyverseOrderNumber, runPosSaleBookkeeping, type PosSaleBookkeepingDeps } from "./pos-sale-bookkeeping";

describe("runPosSaleBookkeeping", () => {
  const deps: jest.Mocked<PosSaleBookkeepingDeps> = {
    stock: jest.fn().mockResolvedValue(undefined),
    loyverse: jest.fn().mockResolvedValue(undefined),
    vouchers: jest.fn().mockResolvedValue(undefined),
    activity: jest.fn().mockResolvedValue(undefined),
    capture: jest.fn().mockResolvedValue(undefined),
    government: jest.fn().mockResolvedValue(undefined),
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

    expect(deps.stock).toHaveBeenCalledWith("t", "abcdef123456", expect.any(Array), "pos");
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

  it("files the Senior/PWD record under the id the order was written with", async () => {
    deps.government.mockClear();
    const draft = {
      orderLabel: null,
      outletId: null,
      revision: 0,
      occurredAt: "2026-10-12T04:00:00.000Z",
      orderTotal: 400,
      source: "pos" as const,
      lines: [],
      serviceCharge: 0,
      deliveryFee: 0,
      allowShared: true,
      government: null,
      approvalId: null,
      approvalSkippedOffline: false,
    };

    await runPosSaleBookkeeping(
      {
        tenantId: "t",
        orderId: "server-id",
        backend: "platform",
        createdAt: 0,
        bookkeeping: {
          stockItems: [],
          loyverseLines: [],
          discountLines: [],
          outletId: null,
          total: 400,
          customerName: "",
          customerContact: "",
          customerData: {},
          channel: null,
          captureItems: [],
          govRecord: draft,
        },
      },
      deps
    );

    expect(deps.government).toHaveBeenCalledWith({
      ...draft,
      tenantId: "t",
      backend: "platform_supabase",
      externalOrderId: "server-id",
    });
  });

  it("files nothing for a sale without a Senior/PWD discount", async () => {
    deps.government.mockClear();
    await runPosSaleBookkeeping(
      {
        tenantId: "t",
        orderId: "o",
        backend: "convex",
        createdAt: 0,
        bookkeeping: {
          stockItems: [],
          loyverseLines: [],
          discountLines: [],
          outletId: null,
          total: 1,
          customerName: "",
          customerContact: "",
          customerData: {},
          channel: null,
          captureItems: [],
        },
      },
      deps
    );
    expect(deps.government).not.toHaveBeenCalled();
  });
});
