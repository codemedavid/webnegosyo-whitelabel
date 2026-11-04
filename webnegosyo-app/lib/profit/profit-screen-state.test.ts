import { profitScreenState, settleProfit } from "./profit-screen-state";
import type { ProfitScreenData } from "./profit-service";
import { PROFIT_LOCKED_MESSAGE, PROFIT_PLATFORM_ONLY_MESSAGE } from "./profit-view";
import { reportWith } from "./profit-fixtures";

const READY: ProfitScreenData = { status: "ready", report: reportWith(), isFirstRun: false, trend: null, trendTitle: "Last 3 months" };
const base = { isAllowed: true, isPlatform: true, data: undefined, isLoading: false, error: null };

describe("which state the Profit screen is in", () => {
  it("is locked before reading for an account without access, and when the database refuses", () => {
    expect(profitScreenState({ ...base, isAllowed: false })).toEqual({ kind: "locked", message: PROFIT_LOCKED_MESSAGE });
    expect(profitScreenState({ ...base, data: { status: "locked", message: "x" } })).toEqual({ kind: "locked", message: "x" });
  });

  it("explains a store that is not on the platform yet, or not switched on", () => {
    expect(profitScreenState({ ...base, isPlatform: false })).toEqual({ kind: "not_set_up", message: PROFIT_PLATFORM_ONLY_MESSAGE });
    expect(profitScreenState({ ...base, data: { status: "not_set_up", message: "later" } })).toEqual({ kind: "not_set_up", message: "later" });
  });

  it("is loading until the first answer", () => {
    expect(profitScreenState({ ...base, isLoading: true })).toEqual({ kind: "loading" });
  });

  it("fails loudly when nothing ever loaded", () => {
    expect(profitScreenState({ ...base, error: "Profit couldn’t load." })).toEqual({ kind: "error", message: "Profit couldn’t load." });
    expect(profitScreenState({ ...base, data: { status: "invalid", message: "Too long." } })).toEqual({ kind: "error", message: "Too long." });
  });

  it("keeps showing the last answer when only a refresh failed, and says so quietly", () => {
    expect(profitScreenState({ ...base, data: READY, error: "offline" })).toEqual({ kind: "ready", data: READY, refreshError: "offline" });
    expect(profitScreenState({ ...base, data: READY })).toEqual({ kind: "ready", data: READY, refreshError: null });
  });
});

describe("settling a read", () => {
  it("throws a passing failure so the cache keeps the last good answer", () => {
    expect(() => settleProfit({ status: "failed", message: "Profit couldn’t load." })).toThrow("Profit couldn’t load.");
  });

  it("keeps every answer the screen must show", () => {
    expect(settleProfit(READY)).toBe(READY);
    const locked: ProfitScreenData = { status: "locked", message: PROFIT_LOCKED_MESSAGE };
    expect(settleProfit(locked)).toBe(locked);
  });
});
