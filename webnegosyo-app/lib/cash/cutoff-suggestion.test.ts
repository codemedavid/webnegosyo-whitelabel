import { fetchOrderHours, suggestCutoff, suggestionWindow } from "./cutoff-suggestion";
import type { CashDb } from "./settings";

const day = (orders: number) => Array.from({ length: 24 }, (_, hour) => ({ hour, orders: hour >= 10 ? orders : 0 }));

describe("suggestCutoff", () => {
  it("suggests nothing for a store that closes before midnight", () => {
    expect(suggestCutoff(day(10), 0)).toBeNull();
  });

  it("suggests ending the day an hour after the last busy late hour", () => {
    const hours = day(10).map((b) => (b.hour <= 2 ? { ...b, orders: 15 } : b));
    // 45 late orders of 185: 24%. Last late hour with orders = 2 AM → day ends 3 AM.
    expect(suggestCutoff(hours, 0)).toEqual({ cutoffMinutes: 180, lateShare: 45 / 185, lateOrders: 45 });
  });

  it("ignores a stray order or two in the small hours", () => {
    const hours = day(10).map((b) => (b.hour === 0 ? { ...b, orders: 20 } : b.hour === 5 ? { ...b, orders: 1 } : b));
    expect(suggestCutoff(hours, 0)?.cutoffMinutes).toBe(60);
  });

  it("stays quiet when the store already ends its day there or later", () => {
    const hours = day(10).map((b) => (b.hour <= 2 ? { ...b, orders: 15 } : b));
    expect(suggestCutoff(hours, 180)).toBeNull();
    expect(suggestCutoff(hours, 240)).toBeNull();
  });

  it("needs enough orders to say anything", () => {
    expect(suggestCutoff([{ hour: 1, orders: 3 }, { hour: 20, orders: 5 }], 0)).toBeNull();
  });
});

describe("fetchOrderHours", () => {
  it("adds up the weekday × hour buckets into 24 hours", async () => {
    const calls: unknown[] = [];
    const db: CashDb = {
      from: () => {
        throw new Error("no table reads");
      },
      rpc: (fn, args) => {
        calls.push([fn, args]);
        return Promise.resolve({
          data: [
            { weekday: 1, hour: 1, orders: 4, net_cents: 100 },
            { weekday: 2, hour: 1, orders: "6", net_cents: 100 },
            { weekday: 2, hour: 20, orders: 10, net_cents: 100 },
          ],
          error: null,
        });
      },
    };
    const window = suggestionWindow(Date.parse("2026-10-27T04:00:00.000Z"));
    const hours = await fetchOrderHours(db, "t1", window);
    expect(hours.find((b) => b.hour === 1)?.orders).toBe(10);
    expect(hours.find((b) => b.hour === 20)?.orders).toBe(10);
    expect(calls).toEqual([
      ["report_sales_by_hour", { p_tenant: "t1", p_from: window.fromIso, p_to: window.toIso, p_tz: "Asia/Manila" }],
    ]);
  });

  it("is a 30-day window ending now", () => {
    const window = suggestionWindow(Date.parse("2026-10-27T04:00:00.000Z"));
    expect(window).toEqual({ fromIso: "2026-09-27T04:00:00.000Z", toIso: "2026-10-27T04:00:00.000Z" });
  });

  it("throws on a refusal, so the card is simply not shown", async () => {
    const db: CashDb = { from: () => null, rpc: () => Promise.resolve({ data: null, error: { code: "42501", message: "no" } }) };
    await expect(fetchOrderHours(db, "t1", suggestionWindow(0))).rejects.toThrow();
  });
});
