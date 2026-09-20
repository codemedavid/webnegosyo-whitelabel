/**
 * The cache's defaults are load-bearing, not taste.
 *
 * `retry: false` is mandatory: every platform read is bounded by the 12 s
 * `withPlatformTimeout`, and v5's default three retries with backoff would turn
 * that into a 40 s+ spinner. `networkMode: "always"` keeps a query from
 * silently pausing on a phone whose online flag is wrong.
 */
import { focusManager } from "@tanstack/query-core";
import {
  PLATFORM_GC_MS,
  PLATFORM_STALE_MS,
  bindQueryManagersToAppState,
  createAppQueryClient,
  resolveStaleMs,
  shouldKeepPreviousData,
} from "./query-client";

describe("createAppQueryClient", () => {
  const client = createAppQueryClient();
  const queries = client.getDefaultOptions().queries ?? {};

  it("never retries a failed read", () => {
    expect(queries.retry).toBe(false);
  });

  it("keeps errors in the result rather than throwing to a boundary", () => {
    expect(queries.throwOnError).toBe(false);
  });

  it("fetches regardless of the online flag", () => {
    expect(queries.networkMode).toBe("always");
  });

  it("uses the platform stale time and a five-minute gc window", () => {
    expect(queries.staleTime).toBe(PLATFORM_STALE_MS);
    expect(queries.gcTime).toBe(PLATFORM_GC_MS);
    expect(PLATFORM_STALE_MS).toBe(10_000);
    expect(PLATFORM_GC_MS).toBe(5 * 60_000);
  });

  it("refetches stale data when the app comes back to the foreground", () => {
    expect(queries.refetchOnWindowFocus).toBe(true);
  });
});

describe("resolveStaleMs", () => {
  it("lets the 10k-row line-item join stay fresh for a minute", () => {
    expect(resolveStaleMs("orders:getAllOrderItems")).toBe(60_000);
  });

  it("falls back to the platform default for every other ref", () => {
    expect(resolveStaleMs("orders:getOrders")).toBe(PLATFORM_STALE_MS);
  });
});

describe("bindQueryManagersToAppState", () => {
  afterEach(() => focusManager.setFocused(undefined));

  it("applies the current state immediately and follows later transitions", () => {
    let handler: ((state: string) => void) | null = null;
    const appState = {
      addEventListener: jest.fn((_event: "change", h: (state: string) => void) => {
        handler = h;
        return { remove: jest.fn() };
      }),
    };
    const setFocused = jest.fn();

    bindQueryManagersToAppState(appState, "background", { setFocused });
    expect(setFocused).toHaveBeenLastCalledWith(false);

    handler!("active");
    expect(setFocused).toHaveBeenLastCalledWith(true);

    handler!("inactive");
    expect(setFocused).toHaveBeenLastCalledWith(false);
  });

  it("drives TanStack's focus manager by default", () => {
    bindQueryManagersToAppState({ addEventListener: jest.fn() }, "background");
    expect(focusManager.isFocused()).toBe(false);

    bindQueryManagersToAppState({ addEventListener: jest.fn() }, "active");
    expect(focusManager.isFocused()).toBe(true);
  });
});

describe("shouldKeepPreviousData", () => {
  it("keeps the last line items on screen while a new order set is read", () => {
    // The read is keyed on the visible order ids, which change with every new
    // order. Without this, each change blanks the kitchen board for a poll.
    expect(shouldKeepPreviousData("orders:getAllOrderItems")).toBe(true);
  });

  it("lets every other ref show a loading state on a key change", () => {
    expect(shouldKeepPreviousData("orders:getDashboardStatsByPeriod")).toBe(false);
    expect(shouldKeepPreviousData("orders:getOrders")).toBe(false);
  });
});
