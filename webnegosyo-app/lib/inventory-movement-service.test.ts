/**
 * Sending a hand-recorded movement to the platform.
 *
 * Unlike POS depletion (lib/pos-stock-notify.ts), this one reports failure.
 * That difference is the whole design: depletion runs behind a sale that is
 * already rung up and paid for, so silence is kinder than a register that will
 * not close. Here the merchant is *watching* — they typed a delivery and are
 * waiting to be told it landed. A swallowed error would show a confirmation for
 * a write that never happened, and they would find out at the next stocktake.
 */

import { submitStockMovement } from "./inventory-movement-service";

jest.mock("./supabase", () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webAppUrl: "https://example.test" } } },
}));

import { supabase } from "./supabase";

const payload = {
  inventory_item_id: "i1",
  reason: "receive" as const,
  quantity: 100,
  unit_id: "u-kg",
};

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

describe("submitting a movement", () => {
  it("posts the payload with the merchant's own token", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, item: { current_qty: 112 } }),
    });

    await submitStockMovement("t1", payload);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://example.test/api/inventory/movement");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toMatchObject({ tenantId: "t1", ...payload });
  });

  it("returns the server's figure rather than the phone's arithmetic", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, item: { current_qty: 112 } }),
    });

    // The screen shows what the ledger settled on, so a rejected or adjusted
    // write can never leave a confident wrong number on the merchant's phone.
    await expect(submitStockMovement("t1", payload)).resolves.toEqual({ currentQty: 112 });
  });

  it("throws when the server rejects it, carrying the reason", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    });

    await expect(submitStockMovement("t1", payload)).rejects.toThrow("Forbidden");
  });

  it("throws when the network is gone", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("offline"));

    // A merchant in a stockroom with no signal must be told, not reassured.
    await expect(submitStockMovement("t1", payload)).rejects.toThrow();
  });

  it("throws rather than posting when there is no session", async () => {
    mockSession(null);

    await expect(submitStockMovement("t1", payload)).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("a request that never comes back", () => {
  /**
   * `fetch` has no timeout of its own. A stalled connection leaves the sheet
   * spinning with no error, no confirmation and no way out but killing the app —
   * and the merchant cannot tell whether their count was recorded, which is the
   * one thing this screen exists to make certain.
   */
  it("gives up rather than spinning forever", async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as never;

    await expect(
      submitStockMovement("t1", payload, null, { timeoutMs: 20 }),
    ).rejects.toThrow(/too long|timed out/i);
  });

  it("says the count may still have been recorded", async () => {
    // The dangerous instruction here is "try again". A timeout is not a
    // failure: the write may well have landed, and a merchant who re-enters a
    // count records it twice.
    global.fetch = jest.fn(() => new Promise(() => {})) as never;

    await expect(
      submitStockMovement("t1", payload, null, { timeoutMs: 20 }),
    ).rejects.toThrow(/may have been saved|check the shelf|before recording it again/i);
  });
});
