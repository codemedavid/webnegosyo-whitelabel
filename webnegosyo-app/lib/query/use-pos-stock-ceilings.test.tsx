/**
 * The stock-ceiling read on the register.
 *
 * It used to fire on every cart change — every "+" tap was a round trip to
 * the platform. Now it is keyed on WHICH dishes are in the sale and debounced,
 * so a burst of taps is one read, and a quantity change is none.
 */
import React from "react";
import { renderHook, act } from "@testing-library/react-native";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webAppUrl: "https://shop.test" } } },
}));
jest.mock("../authorized-post", () => ({ getAccessTokenBounded: async () => null }));
const mockFetchCeilings = jest.fn();
jest.mock("../pos-stock-ceilings", () => ({
  ...jest.requireActual("../pos-stock-ceilings"),
  fetchPosStockCeilings: (...args: unknown[]) => mockFetchCeilings(...args),
}));

import {
  STOCK_AFTER_SALE_DELAY_MS,
  STOCK_CEILING_DEBOUNCE_MS,
  STOCK_REFRESH_INTERVAL_MS,
  usePosStockCeilings,
} from "./use-pos-stock-ceilings";
import type { PosCartLine } from "../pos-cart";

const line = (menuItemId: string, quantity: number) =>
  ({ key: `${menuItemId}:${quantity}`, menuItemId, quantity }) as PosCartLine;

beforeEach(() => {
  jest.useFakeTimers();
  mockFetchCeilings
    .mockReset()
    .mockResolvedValue({ dishes: new Map([["m-1", 4]]), options: new Map() });
});
afterEach(() => {
  jest.useRealTimers();
});

const flush = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe("usePosStockCeilings", () => {
  it("reads once the debounce window has passed, not before", async () => {
    const { result } = renderHook(
      ({ lines }: { lines: PosCartLine[] }) => usePosStockCeilings("t1", "o1", lines),
      { initialProps: { lines: [line("m-1", 1)] } }
    );

    expect(mockFetchCeilings).not.toHaveBeenCalled();
    await flush(STOCK_CEILING_DEBOUNCE_MS - 1);
    expect(mockFetchCeilings).not.toHaveBeenCalled();
    await flush(1);
    expect(mockFetchCeilings).toHaveBeenCalledTimes(1);
    expect(mockFetchCeilings).toHaveBeenCalledWith("t1", "o1");
    await act(async () => {});
    expect(result.current.dishes.get("m-1")).toBe(4);
  });

  it("does not re-read when only a quantity changes", async () => {
    const { rerender } = renderHook(
      ({ lines }: { lines: PosCartLine[] }) => usePosStockCeilings("t1", null, lines),
      { initialProps: { lines: [line("m-1", 1)] } }
    );
    await flush(STOCK_CEILING_DEBOUNCE_MS);
    expect(mockFetchCeilings).toHaveBeenCalledTimes(1);

    rerender({ lines: [line("m-1", 2)] });
    await flush(STOCK_CEILING_DEBOUNCE_MS);
    expect(mockFetchCeilings).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst of new dishes into one read", async () => {
    const { rerender } = renderHook(
      ({ lines }: { lines: PosCartLine[] }) => usePosStockCeilings("t1", null, lines),
      { initialProps: { lines: [] as PosCartLine[] } }
    );
    await flush(STOCK_CEILING_DEBOUNCE_MS);
    expect(mockFetchCeilings).toHaveBeenCalledTimes(1);

    rerender({ lines: [line("m-1", 1)] });
    await flush(100);
    rerender({ lines: [line("m-1", 1), line("m-2", 1)] });
    await flush(100);
    rerender({ lines: [line("m-1", 1), line("m-2", 1), line("m-3", 1)] });
    await flush(STOCK_CEILING_DEBOUNCE_MS);

    expect(mockFetchCeilings).toHaveBeenCalledTimes(2);
  });

  it("answers with no opinion until a tenant is known", async () => {
    const { result } = renderHook(() => usePosStockCeilings(null, null, [line("m-1", 1)]));
    await flush(STOCK_CEILING_DEBOUNCE_MS);
    expect(result.current.dishes.size).toBe(0);
  });

  describe("freshness", () => {
    type Props = { isFocused: boolean; saleStamp: number | null };
    const renderFresh = (initial: Props) =>
      renderHook(
        ({ isFocused, saleStamp }: Props) =>
          usePosStockCeilings("t1", null, [line("m-1", 1)], { isFocused, saleStamp }),
        { initialProps: initial }
      );

    it("re-reads on a timer while the register is on screen", async () => {
      renderFresh({ isFocused: true, saleStamp: null });
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(1);

      await flush(STOCK_REFRESH_INTERVAL_MS);
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(2);

      await flush(STOCK_REFRESH_INTERVAL_MS);
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(3);
    });

    it("shows the fresh count once the timer read lands", async () => {
      const { result } = renderFresh({ isFocused: true, saleStamp: null });
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      await act(async () => {});
      expect(result.current.dishes.get("m-1")).toBe(4);

      mockFetchCeilings.mockResolvedValue({ dishes: new Map([["m-1", 2]]), options: new Map() });
      await flush(STOCK_REFRESH_INTERVAL_MS);
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      await act(async () => {});
      expect(result.current.dishes.get("m-1")).toBe(2);
    });

    it("stops the timer on blur and re-reads when the register comes back", async () => {
      const { rerender } = renderFresh({ isFocused: true, saleStamp: null });
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(1);

      rerender({ isFocused: false, saleStamp: null });
      await flush(STOCK_REFRESH_INTERVAL_MS * 3);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(1);

      rerender({ isFocused: true, saleStamp: null });
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(2);
    });

    it("never runs a timer when not focused (the default)", async () => {
      renderHook(() => usePosStockCeilings("t1", null, [line("m-1", 1)]));
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      await flush(STOCK_REFRESH_INTERVAL_MS * 2);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(1);
    });

    it("re-reads shortly after each completed sale", async () => {
      const { rerender } = renderFresh({ isFocused: false, saleStamp: null });
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(1);

      rerender({ isFocused: false, saleStamp: 1000 });
      await flush(STOCK_AFTER_SALE_DELAY_MS - 1);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(1);
      await flush(1);
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(2);

      rerender({ isFocused: false, saleStamp: 2000 });
      await flush(STOCK_AFTER_SALE_DELAY_MS);
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(3);
    });

    it("skips a timer tick while a read is still in flight", async () => {
      mockFetchCeilings.mockImplementation(() => new Promise(() => {}));
      renderFresh({ isFocused: true, saleStamp: null });
      await flush(STOCK_CEILING_DEBOUNCE_MS);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(1);

      await flush(STOCK_REFRESH_INTERVAL_MS * 3);
      expect(mockFetchCeilings).toHaveBeenCalledTimes(1);
    });

    it("clears its timers on unmount", async () => {
      const { unmount } = renderFresh({ isFocused: true, saleStamp: 5 });
      unmount();
      await flush(STOCK_REFRESH_INTERVAL_MS * 2);
      expect(mockFetchCeilings).not.toHaveBeenCalled();
    });
  });
});
