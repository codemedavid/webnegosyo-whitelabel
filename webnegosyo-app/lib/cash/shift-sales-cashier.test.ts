/**
 * The cashier's own shift report (report_shift_sales p_scope 'cashier',
 * 20261104140000). The fixture is the REAL answer of the PGlite runner
 * (SHIFT_REPORT_DUMP=… node tests/sql/run-shift-report-cashier.cjs), so the
 * parser is pinned to what the database sends, not to a hand-written guess.
 */

jest.mock("../supabase", () => ({ supabase: { rpc: jest.fn() } }));

import fixture from "./shift-report-cashier.fixture.json";
import { fetchShiftSales, parseShiftSalesReply, type ShiftSalesRpcClient } from "./shift-sales";
import { fetchShiftNets, parseShiftNets } from "./shift-nets";

function report(data: unknown) {
  const reply = parseShiftSalesReply(data);
  if (reply.kind !== "report") throw new Error("expected a report");
  return reply.report;
}

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

describe("parseShiftSalesReply — cashier scope", () => {
  it("reads her sales, every item, the voids, the cash block and the money taken on other bills", () => {
    const r = report(fixture.cashier);
    expect(r.scope).toBe("cashier");
    expect(r.summary?.netCents).toBe(117050);
    expect(r.items?.map((i) => [i.label, i.quantity])).toEqual([
      ["Adobo", 5],
      ["Halo-halo", 2],
      ["Rice", 2],
      ["Iced tea", 1],
    ]);
    expect(r.itemsTruncated).toBe(false);
    expect(r.voids).toEqual([
      { orderId: "0a000000-0000-4000-8000-000000000003", number: "#03", placedAt: "2026-10-20T03:00:00.000Z", totalCents: 21000, status: "void" },
    ]);
    expect(r.cash).toEqual({
      floatCents: 50000,
      cashSalesCents: 115000,
      payInCents: 0,
      payOutCents: 0,
      collectedCents: 0,
      expectedCents: 165000,
      expectedSource: "device",
      countedCents: 160000,
      differenceCents: -5000,
    });
    expect(r.otherCollections).toEqual({ count: 1, cents: 99900 });
  });

  it("keeps a hidden (blind, uncounted) answer free of pesos", () => {
    const r = report(fixture.hidden);
    expect([r.hidden, r.scope, r.summary, r.items, r.cash, r.otherCollections]).toEqual([true, "cashier", null, null, null, null]);
    expect(r.receipts.every((receipt) => receipt.totalCents === null)).toBe(true);
  });

  it("reads the truncation flag", () => {
    const r = report(fixture.truncatedHead);
    expect(r.itemsTruncated).toBe(true);
  });

  it("treats a store-window answer (no scope key) as the window, with nothing new", () => {
    const cashierOnly = new Set(["scope", "voids", "cash", "otherCollections", "itemsTruncated", "voidsTruncated"]);
    const windowShaped = Object.fromEntries(
      Object.entries(fixture.cashier as Record<string, unknown>).filter(([key]) => !cashierOnly.has(key)),
    );
    const r = report(windowShaped);
    expect(r.scope).toBe("window");
    expect([r.voids, r.cash, r.otherCollections, r.itemsTruncated]).toEqual([null, null, null, false]);
  });

  it("refuses a cash block with a fractional figure, rather than printing a wrong drawer", () => {
    const bad = { ...(fixture.cashier as Record<string, unknown>), cash: { ...fixture.cashier.cash, expectedCents: 1.5 } };
    expect(() => parseShiftSalesReply(bad)).toThrow(/expectedCents/);
  });

  it("refuses an unknown void status", () => {
    const bad = { ...(fixture.cashier as Record<string, unknown>), voids: [{ ...fixture.cashier.voids[0], status: "lost" }] };
    expect(() => parseShiftSalesReply(bad)).toThrow(/status/);
  });

  it("answers unavailable for a Convex store", () => {
    expect(parseShiftSalesReply(fixture.unavailable)).toEqual({ kind: "unavailable" });
  });
});

describe("fetchShiftSales scope", () => {
  it("sends p_scope only for the cashier's own report (the window call is unchanged)", async () => {
    const { client, calls } = clientAnswering({ data: fixture.cashier, error: null });
    await fetchShiftSales("shift-1", client, "cashier");
    await fetchShiftSales("shift-1", client);
    expect(calls).toEqual([
      { fn: "report_shift_sales", args: { p_shift_id: "shift-1", p_scope: "cashier" } },
      { fn: "report_shift_sales", args: { p_shift_id: "shift-1" } },
    ]);
  });
});

describe("shift nets (My shifts)", () => {
  it("reads one row per shift; hidden and unavailable carry no pesos", () => {
    const nets = parseShiftNets({
      shifts: [
        { shiftId: "s1", status: "ok", orders: 3, netCents: 117050 },
        { shiftId: "s2", status: "hidden", orders: null, netCents: null },
        { shiftId: "s3", status: "unavailable", orders: null, netCents: null },
      ],
    });
    expect(nets.get("s1")).toEqual({ status: "ok", orders: 3, netCents: 117050 });
    expect(nets.get("s2")).toEqual({ status: "hidden", orders: null, netCents: null });
    expect(nets.get("s3")?.status).toBe("unavailable");
  });

  it("refuses a bad shape", () => {
    expect(() => parseShiftNets({ shifts: [{ shiftId: "s1", status: "ok", orders: 1, netCents: 1.5 }] })).toThrow(/netCents/);
    expect(() => parseShiftNets({ shifts: [{ shiftId: "s1", status: "weird" }] })).toThrow(/status/);
    expect(() => parseShiftNets(null)).toThrow();
  });

  it("asks report_shift_nets for at most 31 shifts and says when the database lacks it", async () => {
    const { client, calls } = clientAnswering({ data: { shifts: [] }, error: null });
    const ids = Array.from({ length: 40 }, (_, i) => `s${i}`);
    const result = await fetchShiftNets(ids, client);
    expect(calls).toEqual([{ fn: "report_shift_nets", args: { p_shift_ids: ids.slice(0, 31) } }]);
    expect(result.ok).toBe(true);
    const missing = clientAnswering({ data: null, error: { code: "PGRST202", message: "not found" } });
    expect(await fetchShiftNets(["s1"], missing.client)).toMatchObject({ ok: false, kind: "not_set_up" });
    const none = clientAnswering({ data: null, error: null });
    await fetchShiftNets([], none.client);
    expect(none.calls).toEqual([]);
  });
});
