import { renderHook } from "@testing-library/react-native";

import { resolveProfitWindow } from "./profit-period";
import { glanceFromProfitCache, profitGlanceKey, profitKey, useProfit, useProfitGlance } from "./use-profit";

const mockRpc = jest.fn();
const mockGetQueryState = jest.fn();
const mockUseResource = jest.fn();

jest.mock("../supabase", () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args), from: jest.fn() } }));
jest.mock("../../stores/auth-store", () => ({
  useAuthStore: (select: (s: object) => unknown) => select({ tenantId: "t1", impersonatedTenantId: null }),
}));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ getQueryState: mockGetQueryState }) }));
jest.mock("../query/use-resource", () => ({ useResource: (...args: unknown[]) => mockUseResource(...args) }));
jest.mock("../query/use-screen-focus", () => ({ useRefetchOnScreenFocus: jest.fn() }));

// Wed 2026-10-21 12:00 in Manila.
const NOW = Date.parse("2026-10-21T04:00:00Z");
const HOUR = 3600_000;
const ALL = { outletId: null, unassigned: false };

const summaryRow = {
  orders: 1, net_sales_cents: 100_000, collected_cents: 100_000, sale_movements: 0, ledger_cogs_cents: 0, fallback_cogs_cents: 0,
  fallback_orders: 0, waste_cents: 0, count_variance_cents: 0, uncosted_movements: 0, sold_quantity: 0, costed_quantity: 0,
  sold_dishes: 0, costed_dishes: 0, dish_costs_visible: true, ingredients_cents: 40_000, ingredient_stock_cents: 0, staff_cents: 0,
  occupancy_cents: 0, utilities_cents: 0, operating_cents: 0, admin_cents: 0, other_cents: 0, capex_cents: 0, not_expense_cents: 0,
  expense_count: 1, store_wide_expense_cents: 0, unsorted_payouts: 0, unsorted_payout_cents: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  mockRpc.mockImplementation(async (fn: string) => ({ data: fn === "report_profit_summary" ? [summaryRow] : [], error: null }));
  mockUseResource.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: jest.fn(), isRefetching: false, dataUpdatedAt: 0 });
  mockGetQueryState.mockReturnValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function summaryEnds(): string[] {
  return mockRpc.mock.calls.filter(([fn]) => fn === "report_profit_summary").map(([, args]) => args.p_to);
}

describe("useProfit", () => {
  it("reads sales up to the moment of each refetch, not the first fetch's end", async () => {
    // Arrange: the window was resolved once, at NOW.
    const w = resolveProfitWindow({ preset: "this_month" }, NOW);
    renderHook(() => useProfit(w, ALL, true));
    const fetcher = mockUseResource.mock.calls[0][1] as () => Promise<unknown>;

    // Act: a focus refresh three hours later reuses the memoised fetcher.
    await fetcher();
    jest.spyOn(Date, "now").mockReturnValue(NOW + 3 * HOUR);
    await fetcher();

    // Assert
    expect(summaryEnds()).toEqual([new Date(NOW).toISOString(), new Date(NOW + 3 * HOUR).toISOString()]);
  });

  it("keeps one cache key for a period however often it renders, so it never refetches in a loop", () => {
    const { rerender } = renderHook(({ now }: { now: number }) => useProfit(resolveProfitWindow({ preset: "this_month" }, now), ALL, true), {
      initialProps: { now: NOW },
    });
    rerender({ now: NOW + 60_000 });

    const keys = mockUseResource.mock.calls.map(([key]) => JSON.stringify(key));
    expect(new Set(keys).size).toBe(1);
    const fetchers = mockUseResource.mock.calls.map(([, fetcher]) => fetcher);
    expect(fetchers[0]).toBe(fetchers[1]);
  });
});

describe("useProfitGlance", () => {
  const w = resolveProfitWindow({ preset: "this_month" }, NOW);

  it("reads the summary alone, on its own key under the profit name", async () => {
    renderHook(() => useProfitGlance(w, ALL, true));
    const [key, fetcher] = mockUseResource.mock.calls[0] as [unknown, () => Promise<unknown>];

    await fetcher();

    expect(key).toEqual(profitGlanceKey("t1", w, ALL));
    expect((key as unknown[])[1]).toBe("profit");
    expect(mockRpc.mock.calls.map(([fn]) => fn)).toEqual(["report_profit_summary"]);
  });

  it("uses a fresh Profit read already in the cache instead of reading again", () => {
    // Arrange
    const report = { profitCents: 60_000, ratios: { profit: 0.6 } };
    mockGetQueryState.mockReturnValue({ data: { status: "ready", report }, dataUpdatedAt: NOW - 1_000, isInvalidated: false });

    // Act
    const { result } = renderHook(() => useProfitGlance(w, ALL, true));

    // Assert
    expect(mockGetQueryState).toHaveBeenCalledWith(profitKey("t1", w, ALL));
    expect(mockUseResource.mock.calls[0][0]).toBeNull();
    expect(result.current).toEqual({ profitCents: 60_000, ratios: { profit: 0.6 }, isPartial: true });
  });

  it("reads nothing for an account that may not see it", () => {
    const { result } = renderHook(() => useProfitGlance(w, ALL, false));

    expect(mockUseResource.mock.calls[0][0]).toBeNull();
    expect(result.current).toBeNull();
  });
});

describe("glanceFromProfitCache", () => {
  const ready = { status: "ready", report: { profitCents: 5, ratios: { profit: 0.5 } } };

  it("stands in only while fresh, ready and not invalidated", () => {
    expect(glanceFromProfitCache({ data: ready, dataUpdatedAt: NOW - 1_000, isInvalidated: false }, { isPartial: false }, NOW)).toEqual({
      profitCents: 5,
      ratios: { profit: 0.5 },
      isPartial: false,
    });
    expect(glanceFromProfitCache({ data: ready, dataUpdatedAt: NOW - 120_000, isInvalidated: false }, { isPartial: false }, NOW)).toBeNull();
    expect(glanceFromProfitCache({ data: ready, dataUpdatedAt: NOW, isInvalidated: true }, { isPartial: false }, NOW)).toBeNull();
    expect(glanceFromProfitCache({ data: { status: "locked", message: "x" }, dataUpdatedAt: NOW, isInvalidated: false }, { isPartial: false }, NOW)).toBeNull();
    expect(glanceFromProfitCache(undefined, { isPartial: false }, NOW)).toBeNull();
  });
});
