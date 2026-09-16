/**
 * The register's order types and their per-item prices, on the shared cache.
 *
 * They ride ONE cache entry because a chip shown before its prices have
 * landed would ring up at list price on a marked-up channel. Cached rather
 * than loaded once on mount: the register tab never unmounts, so a one-shot
 * read is a register that is out of date until the app is force-quit.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

const mockListRegisterOrderTypes = jest.fn();
const mockListOrderTypeItemPrices = jest.fn();

jest.mock("../pos-catalog", () => ({
  listRegisterOrderTypes: (...args: unknown[]) => mockListRegisterOrderTypes(...args),
  listOrderTypeItemPrices: (...args: unknown[]) => mockListOrderTypeItemPrices(...args),
}));

import { createAppQueryClient } from "./query-client";
import { invalidateRegisterPricing, useRegisterPricing } from "./use-register-pricing";

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const DINE_IN = { id: "t1", type: "dine_in", name: "Dine in", serviceCharge: undefined };
const PRICE_ROW = { order_type_id: "t1", menu_item_id: "p1", price: 150, modifier_prices: null };

beforeEach(() => {
  client = createAppQueryClient();
  mockListRegisterOrderTypes.mockReset().mockResolvedValue([DINE_IN]);
  mockListOrderTypeItemPrices.mockReset().mockResolvedValue([PRICE_ROW]);
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  (console.error as jest.Mock).mockRestore();
});

describe("useRegisterPricing", () => {
  it("is idle without a tenant", () => {
    const { result } = renderHook(() => useRegisterPricing(null), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(mockListRegisterOrderTypes).not.toHaveBeenCalled();
  });

  it("hands the types and their price index over together, on one read", async () => {
    const { result } = renderHook(
      () => ({ a: useRegisterPricing("t1"), b: useRegisterPricing("t1") }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.a.isLoading).toBe(false));

    expect(mockListRegisterOrderTypes).toHaveBeenCalledTimes(1);
    expect(mockListOrderTypeItemPrices).toHaveBeenCalledTimes(1);
    expect(result.current.b.data?.orderTypes).toEqual([DINE_IN]);
    expect(result.current.b.data?.priceIndex.t1?.p1).toBe(150);
  });

  it("surfaces a failed price read as an error rather than list prices", async () => {
    mockListOrderTypeItemPrices.mockRejectedValueOnce(new Error("prices unavailable"));
    const { result } = renderHook(() => useRegisterPricing("t1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("prices unavailable");
    expect(result.current.data).toBeUndefined();
  });

  it("re-reads on invalidation, so an edited price reaches the register", async () => {
    const { result } = renderHook(() => useRegisterPricing("t1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await invalidateRegisterPricing(client, "t1");
    });
    expect(mockListRegisterOrderTypes).toHaveBeenCalledTimes(2);
  });
});
