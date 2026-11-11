/**
 * `useTradingDay`: the store's business day on a screen, with an honest flag
 * when the setting could not be read.
 */
import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

let mockAnswer: { data: unknown; error: unknown } = { data: [], error: null };
let mockReads = 0;

jest.mock("../supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) chain[method] = () => chain;
  chain.limit = () => {
    mockReads += 1;
    return Promise.resolve(mockAnswer);
  };
  return { supabase: { from: () => chain } };
});

import { createAppQueryClient } from "../query/query-client";
import { useAuthStore } from "../../stores/auth-store";
import { resolveScheduleState, useTradingDay } from "./use-trading-day";

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = createAppQueryClient();
  mockAnswer = { data: [], error: null };
  mockReads = 0;
  useAuthStore.getState().clear();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe("resolveScheduleState", () => {
  it("uses a loaded schedule as is", () => {
    expect(resolveScheduleState([{ effectiveFrom: "2026-01-01", cutoffMinutes: 240 }], false, null)).toEqual({
      schedule: [{ effectiveFrom: "2026-01-01", cutoffMinutes: 240 }],
      isFallback: false,
      isLoading: false,
    });
  });

  it("is loading, not a fallback, before the first answer", () => {
    expect(resolveScheduleState(undefined, true, null)).toEqual({ schedule: [], isFallback: false, isLoading: true });
  });

  it("flags midnight as a stand-in when the read failed", () => {
    expect(resolveScheduleState(undefined, false, "timeout")).toEqual({ schedule: [], isFallback: true, isLoading: false });
  });

  it("flags a saved copy it cannot trust", () => {
    expect(resolveScheduleState([{ effectiveFrom: "x", cutoffMinutes: 240 }], false, null).isFallback).toBe(true);
  });

  it("is plain midnight with no store in scope", () => {
    expect(resolveScheduleState(undefined, false, null)).toEqual({ schedule: [], isFallback: false, isLoading: false });
  });
});

describe("useTradingDay", () => {
  it("reads the signed-in store's schedule and opens today at its cutoff", async () => {
    useAuthStore.getState().setAuth({ tenantId: "t1" });
    mockAnswer = { data: [{ effective_from: "2000-01-01", cutoff_minutes: 240 }], error: null };

    const { result } = renderHook(() => useTradingDay(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFallback).toBe(false);
    expect(result.current.schedule).toEqual([{ effectiveFrom: "2000-01-01", cutoffMinutes: 240 }]);
    // Today opens at 4:00 AM Manila = 20:00 UTC the evening before.
    expect(new Date(result.current.startMs).toISOString().slice(11)).toBe("20:00:00.000Z");
    expect(result.current.endMs - result.current.startMs).toBe(24 * 60 * 60 * 1000);
    expect(result.current.startMs).toBeLessThanOrEqual(result.current.anchorMs);
    expect(result.current.anchorMs).toBeLessThan(result.current.endMs);
    expect(mockReads).toBe(1);
  });

  it("falls back to midnight, flagged, when the setting cannot be read", async () => {
    useAuthStore.getState().setAuth({ tenantId: "t1" });
    mockAnswer = { data: null, error: { code: "57014", message: "timeout" } };

    const { result } = renderHook(() => useTradingDay(), { wrapper });

    await waitFor(() => expect(result.current.isFallback).toBe(true));
    expect(result.current.schedule).toEqual([]);
    expect(new Date(result.current.startMs).toISOString().slice(11)).toBe("16:00:00.000Z");
  });

  it("is midnight and idle with no store signed in", () => {
    const { result } = renderHook(() => useTradingDay(), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFallback).toBe(false);
    expect(mockReads).toBe(0);
  });
});
