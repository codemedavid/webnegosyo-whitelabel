/**
 * Moving stock between shops from the phone.
 *
 * Same split as `inventory-movement-service.ts`: the WRITE goes through the
 * platform route, the READ goes straight to Supabase.
 *
 * That is not inconsistency. A transfer write is two ledger legs that must
 * agree, a status transition, and a frozen source cost — none of which a client
 * can be trusted to compose. A read is just rows the merchant's own RLS already
 * decides they may see, and routing it through the server would add a hop that
 * protects nothing.
 *
 * Failures surface. The merchant is standing at a bench waiting to be told the
 * count landed; a swallowed error would show a confirmation for a write that
 * never happened, and the shortfall would surface later as somebody else's
 * shrinkage.
 */

import {
  submitTransferStep,
  loadTransfers,
} from "./inventory-transfer-service";

jest.mock("./supabase", () => ({
  supabase: { auth: { getSession: jest.fn() }, from: jest.fn() },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webAppUrl: "https://example.test" } } },
}));

import { supabase } from "./supabase";

function mockSession(token: string | null) {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession("tok");
  global.fetch = jest.fn();
});

describe("performing a transfer step", () => {
  it("posts to the transfers route with the merchant's own token", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    await submitTransferStep("t1", { action: "send", transferId: "tr1" });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://example.test/api/inventory/transfers");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({
      tenantId: "t1",
      action: "send",
      transferId: "tr1",
    });
  });

  it("sends the counted quantities when counting a delivery in", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    await submitTransferStep("t1", {
      action: "receive",
      transferId: "tr1",
      counts: { flour: 12 },
    });

    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).counts).toEqual({
      flour: 12,
    });
  });

  it("surfaces the server's reason rather than a generic failure", async () => {
    // "You can only move stock in and out of your own branch" is the one
    // message a branch manager most needs; a generic error would leave them
    // retrying something that can never work.
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "You can only move stock in and out of your own branch" }),
    });

    await expect(
      submitTransferStep("t1", { action: "send", transferId: "tr1" }),
    ).rejects.toThrow("You can only move stock in and out of your own branch");
  });

  it("refuses to send at all without a session", async () => {
    // Checked before the request so an expired session reads as "sign in
    // again" rather than as a rejection of the count they just took.
    mockSession(null);

    await expect(
      submitTransferStep("t1", { action: "send", transferId: "tr1" }),
    ).rejects.toThrow(/session/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not swallow a network failure", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("offline"));

    await expect(
      submitTransferStep("t1", { action: "send", transferId: "tr1" }),
    ).rejects.toThrow();
  });
});

describe("reading the transfers this account may see", () => {
  function mockRows(rows: unknown[] | null, error: unknown = null) {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: async () => ({ data: rows, error }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);
  }

  it("maps rows onto the shape the list renders", async () => {
    mockRows([
      {
        id: "tr1",
        status: "sent",
        from_outlet_id: "north",
        to_outlet_id: "south",
        created_at: "2026-08-01T10:00:00.000Z",
        stock_transfer_lines: [{ id: "l1" }, { id: "l2" }],
      },
    ]);

    const transfers = await loadTransfers("t1");

    expect(transfers).toEqual([
      {
        id: "tr1",
        status: "sent",
        fromOutletId: "north",
        toOutletId: "south",
        lineCount: 2,
        createdAt: "2026-08-01T10:00:00.000Z",
      },
    ]);
  });

  it("returns an empty list rather than throwing when the read fails", async () => {
    // Unlike the write, nobody is waiting on a specific answer here — an empty
    // list with a working screen beats a crash on the tab that also holds the
    // shelf.
    mockRows(null, { message: "denied" });

    await expect(loadTransfers("t1")).resolves.toEqual([]);
  });

  it("asks for nothing without a tenant", async () => {
    await expect(loadTransfers("")).resolves.toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
