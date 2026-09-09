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
const mockFetchCeilings = jest.fn();
jest.mock("../pos-stock-ceilings", () => ({
  ...jest.requireActual("../pos-stock-ceilings"),
  fetchPosStockCeilings: (...args: unknown[]) => mockFetchCeilings(...args),
}));

import { STOCK_CEILING_DEBOUNCE_MS, usePosStockCeilings } from "./use-pos-stock-ceilings";
import type { PosCartLine } from "../pos-cart";

const line = (menuItemId: string, quantity: number) =>
  ({ key: `${menuItemId}:${quantity}`, menuItemId, quantity }) as PosCartLine;

beforeEach(() => {
  jest.useFakeTimers();
  mockFetchCeilings.mockReset().mockResolvedValue(new Map([["m-1", 4]]));
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
    expect(result.current.get("m-1")).toBe(4);
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
    expect(result.current.size).toBe(0);
  });
});
