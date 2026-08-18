import { runCustomersExport, runOrdersExport, runSalesExport } from "./run-export";
import type { ExportOrderInput, ExportOrderItemInput } from "./orders-export";

const DAY_MS = 24 * 60 * 60 * 1000;
// 2026-08-18 10:00 Manila.
const NOW = Date.UTC(2026, 7, 18, 2, 0, 0);
// 2026-08-18 00:00 Manila.
const TODAY_START = Date.UTC(2026, 7, 17, 16, 0, 0);

function order(overrides: Partial<ExportOrderInput> = {}): ExportOrderInput {
  return {
    _id: "o1",
    _creationTime: TODAY_START + 60 * 60 * 1000,
    customerName: "Juan",
    total: 100,
    itemCount: 1,
    status: "delivered",
    ...overrides,
  };
}

describe("runOrdersExport", () => {
  it("shares a CSV named for the window and returns complete coverage", async () => {
    const share = jest.fn(async () => "file:///cache/x.csv");
    const items: ExportOrderItemInput[] = [
      { orderId: "o1", menuItemName: "Burger", quantity: 1, subtotal: 100 },
    ];

    const coverage = await runOrdersExport({
      orders: [order()],
      items,
      preset: "7d",
      nowMs: NOW,
      fetchLimit: 2000,
      share,
    });

    expect(coverage.isComplete).toBe(true);
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0] as unknown as { fileName: string; csv: string };
    expect(arg.fileName).toBe("orders_2026-08-12_2026-08-18.csv");
    expect(arg.csv).toContain("1x Burger");
  });

  it("narrows to one status when asked", async () => {
    const share = jest.fn(async () => "uri");

    await runOrdersExport({
      orders: [order({ _id: "keep" }), order({ _id: "drop", status: "pending" })],
      items: [],
      preset: "today",
      status: "delivered",
      nowMs: NOW,
      fetchLimit: 2000,
      share,
    });

    const arg = share.mock.calls[0][0] as unknown as { csv: string };
    expect(arg.csv).toContain("keep");
    expect(arg.csv).not.toContain("drop");
  });

  it("reports truncated coverage when the fetch cap cut the window", async () => {
    const share = jest.fn(async () => "uri");
    // Two "fetched" orders standing in for a full page whose oldest row is
    // inside the 7d window.
    const oldest = TODAY_START - 2 * DAY_MS;
    const coverage = await runOrdersExport({
      orders: [order(), order({ _id: "o2", _creationTime: oldest })],
      items: [],
      preset: "7d",
      nowMs: NOW,
      fetchLimit: 2,
      share,
    });

    expect(coverage.isComplete).toBe(false);
    expect(coverage.effectiveStartMs).toBe(oldest);
  });
});

describe("runSalesExport", () => {
  it("shares the daily sales CSV for the window", async () => {
    const share = jest.fn(async () => "uri");

    await runSalesExport({
      orders: [order({ total: 350, itemCount: 2 })],
      preset: "today",
      nowMs: NOW,
      fetchLimit: 2000,
      share,
    });

    const arg = share.mock.calls[0][0] as unknown as { fileName: string; csv: string };
    expect(arg.fileName).toBe("sales_2026-08-18.csv");
    expect(arg.csv).toContain("2026-08-18,1,2,350,350");
    expect(arg.csv).toContain("TOTAL,1,2,350,350");
  });
});

describe("runCustomersExport", () => {
  it("shares the guest list dated today", async () => {
    const share = jest.fn(async () => "uri");

    await runCustomersExport({
      customers: [
        {
          name: "Maria",
          phoneE164: null,
          email: null,
          notes: null,
          orderCount: 1,
          totalSpent: 100,
          averageOrderValue: 100,
          firstOrderAt: null,
          lastOrderAt: null,
          channelsUsed: [],
          smsConsent: false,
          smsOptOut: false,
        },
      ],
      nowMs: NOW,
      share,
    });

    const arg = share.mock.calls[0][0] as unknown as { fileName: string; csv: string };
    expect(arg.fileName).toBe("customers_2026-08-18.csv");
    expect(arg.csv).toContain("Maria");
  });
});
