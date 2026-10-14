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

  it("answers the stock outcome so a durable queue can retry it", async () => {
    deps.stock.mockResolvedValueOnce("retry");
    const outcome = await runPosSaleBookkeeping(facts(), deps);
    expect(outcome).toEqual({ stock: "retry" });
  });

  it("runs only the stock call when the reports already ran", async () => {
    jest.clearAllMocks();
    deps.stock.mockResolvedValueOnce("ok");

    const outcome = await runPosSaleBookkeeping({ ...facts(), skipReports: true }, deps);

    expect(outcome).toEqual({ stock: "ok" });
    expect(deps.stock).toHaveBeenCalledTimes(1);
    expect(deps.loyverse).not.toHaveBeenCalled();
    expect(deps.vouchers).not.toHaveBeenCalled();
    expect(deps.activity).not.toHaveBeenCalled();
    expect(deps.capture).not.toHaveBeenCalled();
  });

  it("checkpoints the reports the moment they resolve, while the stock call is still out", async () => {
    // A crash between the reports landing and the stock call settling must not
    // send the Loyverse receipt, the voucher burn or the activity line twice.
    jest.clearAllMocks();
    let releaseStock: (outcome: "ok") => void = () => undefined;
    deps.stock.mockImplementationOnce(() => new Promise((resolve) => { releaseStock = resolve; }));
    const onReportsDone = jest.fn().mockResolvedValue(undefined);

    const running = runPosSaleBookkeeping({ ...facts(), onReportsDone }, deps);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onReportsDone).toHaveBeenCalledTimes(1);
    releaseStock("ok");
    await expect(running).resolves.toEqual({ stock: "ok" });
  });

  it("does not checkpoint reports it skipped", async () => {
    jest.clearAllMocks();
    const onReportsDone = jest.fn();
    await runPosSaleBookkeeping({ ...facts(), skipReports: true, onReportsDone }, deps);
    expect(onReportsDone).not.toHaveBeenCalled();
  });

  it("still settles when the checkpoint cannot be written", async () => {
    jest.clearAllMocks();
    deps.stock.mockResolvedValueOnce("ok");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const onReportsDone = jest.fn().mockRejectedValue(new Error("disk full"));

    await expect(runPosSaleBookkeeping({ ...facts(), onReportsDone }, deps)).resolves.toEqual({ stock: "ok" });
    warn.mockRestore();
  });
});

function facts() {
  return {
    tenantId: "t",
    orderId: "abcdef123456",
    backend: "platform" as const,
    createdAt: 0,
    bookkeeping: {
      stockItems: [{ menuItemId: "m", quantity: 1, optionIds: [], addonIds: [] }],
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
  };
}
