import { reportAbandonedStock, setStockAbandonSink } from "./stock-abandoned";

/**
 * A stock call the device gives up on leaves the shelf wrong until a stocktake,
 * and nothing else will ever notice. It must be loud: a warning on the device
 * log and, when crash reporting is wired, an event in Sentry.
 */
describe("reportAbandonedStock", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    setStockAbandonSink(null);
  });

  const call = {
    tenantId: "t1",
    orderId: "o1",
    action: "restore",
    reason: "exhausted" as const,
    attempts: 48,
  };

  it("warns with the order, the store, the action and why", () => {
    reportAbandonedStock(call);

    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain("o1");
    expect(line).toContain("t1");
    expect(line).toContain("restore");
    expect(line).toContain("exhausted");
  });

  it("hands the event to the registered sink with searchable tags", () => {
    const sink = jest.fn();
    setStockAbandonSink(sink);

    reportAbandonedStock({ ...call, reason: "refused", attempts: 1 });

    expect(sink).toHaveBeenCalledWith(expect.stringContaining("refused"), {
      tenantId: "t1",
      orderId: "o1",
      stockAction: "restore",
      reason: "refused",
      attempts: "1",
    });
  });

  it("never throws, even when the sink does", () => {
    setStockAbandonSink(() => {
      throw new Error("sentry down");
    });
    expect(() => reportAbandonedStock(call)).not.toThrow();
  });
});
