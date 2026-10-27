/**
 * The shift sales report as the database sends it (CONTRACTS §4): parsed by
 * hand (the app has no zod), so a reply without the promised shape fails
 * loudly instead of rendering as ₱0, and a hidden (blind) reply keeps its
 * receipts while every peso figure stays unknown.
 */

jest.mock("../supabase", () => ({ supabase: { rpc: jest.fn() } }));

import {
  fetchPeriodSales,
  fetchShiftSales,
  parseShiftSalesReply,
  SHIFT_SALES_FAILED_MESSAGE,
  type ShiftSalesRpcClient,
} from "./shift-sales";

function serverReply(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "server",
    hidden: false,
    window: { from: "2026-10-24T04:00:00.000Z", to: "2026-10-24T12:00:00.000Z" },
    shift: {
      id: "shift-1",
      staffName: "Ana",
      drawerName: "Cashier 1",
      openedAt: "2026-10-24T04:00:00.000Z",
      closedAt: null,
      businessDay: "2026-10-24",
      servicePeriodName: "Day shift",
    },
    summary: {
      orders: 3,
      grossCents: 150000,
      discountCents: 5000,
      netCents: 145000,
      serviceChargeCents: 0,
      deliveryCents: 0,
      collectedCents: 120000,
      unpaidCents: 25000,
      overpaidCents: 0,
      voidCount: 1,
      voidCents: 32000,
      refundCents: 0,
    },
    payments: [{ key: "cash", label: "Cash", cents: 90000, count: 2 }],
    orderTypes: [{ key: "dine_in", label: "Dine-in", orders: 3, netCents: 145000 }],
    channels: [{ key: "pos", label: "Counter", orders: 3, netCents: 145000 }],
    items: [{ label: "Sisig", quantity: 4, netCents: 80000 }],
    receipts: [
      {
        orderId: "o1",
        number: "#01",
        placedAt: "2026-10-24T04:10:00.000Z",
        orderTypeLabel: "Dine-in",
        methodLabel: "Cash",
        totalCents: 50000,
        status: "paid",
      },
    ],
    receiptsTruncated: false,
    firstNumber: "#01",
    lastNumber: "#04",
    ...overrides,
  };
}

describe("parseShiftSalesReply", () => {
  it("reads a full server report into centavo figures", () => {
    const reply = parseShiftSalesReply(serverReply());
    expect(reply.kind).toBe("report");
    if (reply.kind !== "report") return;
    expect(reply.report.source).toBe("server");
    expect(reply.report.summary?.netCents).toBe(145000);
    expect(reply.report.shift?.servicePeriodName).toBe("Day shift");
    expect(reply.report.receipts[0]).toEqual({
      orderId: "o1",
      number: "#01",
      placedAt: "2026-10-24T04:10:00.000Z",
      orderTypeLabel: "Dine-in",
      methodLabel: "Cash",
      totalCents: 50000,
      status: "paid",
    });
    expect(reply.report.firstNumber).toBe("#01");
    expect(reply.report.lastNumber).toBe("#04");
  });

  it("answers 'unavailable' for a store whose orders are not on the platform", () => {
    expect(parseShiftSalesReply({ source: "unavailable" })).toEqual({ kind: "unavailable" });
  });

  it("keeps a hidden (blind) reply's receipts while its money stays unknown, never 0", () => {
    const reply = parseShiftSalesReply(
      serverReply({
        hidden: true,
        summary: null,
        payments: null,
        orderTypes: null,
        channels: null,
        items: null,
        receipts: [
          {
            orderId: "o1",
            number: 7,
            placedAt: "2026-10-24T04:10:00.000Z",
            orderTypeLabel: null,
            methodLabel: null,
            totalCents: null,
            status: "unpaid",
          },
        ],
      }),
    );
    if (reply.kind !== "report") throw new Error("expected a report");
    expect(reply.report.hidden).toBe(true);
    expect(reply.report.summary).toBeNull();
    expect(reply.report.payments).toBeNull();
    expect(reply.report.receipts[0].totalCents).toBeNull();
    // A bare daily number is shown the way the app prints it.
    expect(reply.report.receipts[0].number).toBe("#07");
  });

  it("accepts bigint figures PostgREST sends as numeric strings", () => {
    const base = serverReply();
    const reply = parseShiftSalesReply({
      ...base,
      summary: { ...(base.summary as Record<string, unknown>), netCents: "145000" },
    });
    if (reply.kind !== "report") throw new Error("expected a report");
    expect(reply.report.summary?.netCents).toBe(145000);
  });

  it("refuses a figure that is not a whole number of centavos", () => {
    const base = serverReply();
    expect(() =>
      parseShiftSalesReply({ ...base, summary: { ...(base.summary as Record<string, unknown>), netCents: 12.5 } }),
    ).toThrow(/netCents/);
  });

  it("refuses an unknown receipt status rather than guessing one", () => {
    const base = serverReply();
    const receipt = (base.receipts as Record<string, unknown>[])[0];
    expect(() => parseShiftSalesReply({ ...base, receipts: [{ ...receipt, status: "lost" }] })).toThrow(/status/);
  });

  it("refuses a reply that is not an object", () => {
    expect(() => parseShiftSalesReply(null)).toThrow();
    expect(() => parseShiftSalesReply([1, 2])).toThrow();
  });

  it("treats a missing first/last number as unknown", () => {
    const reply = parseShiftSalesReply(serverReply({ firstNumber: null, lastNumber: undefined, receipts: [] }));
    if (reply.kind !== "report") throw new Error("expected a report");
    expect(reply.report.firstNumber).toBeNull();
    expect(reply.report.lastNumber).toBeNull();
  });
});

function clientAnswering(reply: { data: unknown; error: { code?: string; message?: string } | null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: ShiftSalesRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve(reply);
    },
  };
  return { client, calls };
}

describe("fetchShiftSales", () => {
  it("asks report_shift_sales for one shift and parses the answer", async () => {
    const { client, calls } = clientAnswering({ data: serverReply(), error: null });
    const result = await fetchShiftSales("shift-1", client);
    expect(calls).toEqual([{ fn: "report_shift_sales", args: { p_shift_id: "shift-1" } }]);
    expect(result.ok && result.reply.kind).toBe("report");
  });

  it("calls a refusal 'forbidden' (42501), with words for staff", async () => {
    const { client } = clientAnswering({ data: null, error: { code: "42501", message: "permission denied" } });
    const result = await fetchShiftSales("shift-1", client);
    expect(result).toMatchObject({ ok: false, kind: "forbidden" });
  });

  it("calls a missing function 'not_set_up' so the screen can count on the tablet", async () => {
    const { client } = clientAnswering({ data: null, error: { code: "PGRST202", message: "not found" } });
    expect(await fetchShiftSales("shift-1", client)).toMatchObject({ ok: false, kind: "not_set_up" });
  });

  it("calls a malformed answer a failure, never an empty report", async () => {
    const { client } = clientAnswering({ data: { source: "server", hidden: "no" }, error: null });
    expect(await fetchShiftSales("shift-1", client)).toEqual({
      ok: false,
      kind: "failed",
      message: SHIFT_SALES_FAILED_MESSAGE,
    });
  });

  it("gives up after its deadline instead of spinning forever", async () => {
    jest.useFakeTimers();
    try {
      const client: ShiftSalesRpcClient = { rpc: () => new Promise(() => undefined) };
      const pending = fetchShiftSales("shift-1", client);
      jest.advanceTimersByTime(30_000);
      expect(await pending).toMatchObject({ ok: false, kind: "failed" });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("fetchPeriodSales", () => {
  it("sends the window as ISO instants and the branch only when one is chosen", async () => {
    const { client, calls } = clientAnswering({ data: serverReply({ shift: null }), error: null });
    await fetchPeriodSales(
      { tenantId: "t1", from: "2026-10-24T04:00:00.000Z", to: "2026-10-24T12:00:00.000Z", outletId: null },
      client,
    );
    await fetchPeriodSales(
      { tenantId: "t1", from: "2026-10-24T04:00:00.000Z", to: "2026-10-24T12:00:00.000Z", outletId: "b1" },
      client,
    );
    expect(calls).toEqual([
      {
        fn: "report_period_sales",
        args: { p_tenant: "t1", p_from: "2026-10-24T04:00:00.000Z", p_to: "2026-10-24T12:00:00.000Z" },
      },
      {
        fn: "report_period_sales",
        args: { p_tenant: "t1", p_from: "2026-10-24T04:00:00.000Z", p_to: "2026-10-24T12:00:00.000Z", p_outlet: "b1" },
      },
    ]);
  });

  it("passes the database's own words for a period it refuses (22023)", async () => {
    const { client } = clientAnswering({ data: null, error: { code: "22023", message: "A report covers at most 93 days." } });
    expect(
      await fetchPeriodSales({ tenantId: "t1", from: "a", to: "b", outletId: null }, client),
    ).toEqual({ ok: false, kind: "invalid", message: "A report covers at most 93 days." });
  });
});
