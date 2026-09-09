/**
 * The React half of the platform read path, exercised with renderHook.
 *
 * Defects pinned here:
 *  1. `isLoading` armed once at mount and never again — switching store or
 *     period silently showed the PREVIOUS tenant/period's numbers with no
 *     loading state until the new fetch landed.
 *  2. A platform read that hangs (GoTrue auth-lock stall) kept the screen in
 *     its loading state forever instead of surfacing an error.
 *  3. Every hook instance owned its own fetch, poll timer and realtime channel:
 *     the Dashboard alone ran seven channels against the same rows, and a
 *     realtime status flip re-fired the fetch effect. One cache entry and one
 *     channel per identity now; a payload refetches only the keys it touches.
 */

const mockRunPlatformQuery = jest.fn();

interface FakeChannel {
  name: string;
  onCallback: ((payload: unknown) => void) | null;
  statusCallback: ((status: string) => void) | null;
}
interface FakeChannelHandle {
  on: (event: unknown, binding: unknown, cb: (payload: unknown) => void) => FakeChannelHandle;
  subscribe: (cb: (status: string) => void) => FakeChannelHandle;
}
const mockChannels: FakeChannel[] = [];
const mockRemoveChannel = jest.fn();

jest.mock("../supabase", () => ({
  __esModule: true,
  supabase: {
    channel: jest.fn((name: string) => {
      const record: FakeChannel = { name, onCallback: null, statusCallback: null };
      mockChannels.push(record);
      const channel: FakeChannelHandle = {
        on: (_e, _b, cb) => {
          record.onCallback = cb;
          return channel;
        },
        subscribe: (cb) => {
          record.statusCallback = cb;
          return channel;
        },
      };
      return channel;
    }),
    // Read lazily: the hoisted factory runs before the `const` above initialises.
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

jest.mock("./supabase-adapter", () => ({
  __esModule: true,
  runPlatformQuery: (...args: unknown[]) => mockRunPlatformQuery(...args),
}));

import React from "react";
import { render, renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { NavigationContext } from "@react-navigation/native";
import { createAppQueryClient } from "../query/query-client";
import { realtimeHub } from "./realtime-hub-singleton";
import { usePlatformQuery, type SafeQueryResult } from "./use-platform-query";
import type { BranchScope } from "../branch-scope";

const ALL: BranchScope = { kind: "all" };
const SOUTH: BranchScope = { kind: "branch", outletId: "south" };
const NORTH_SALE = { new: { tenant_id: "tenant-1", outlet_id: "north" } };

let client: QueryClient;

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/** Fetch count for one ref, optionally narrowed by scope kind. */
function fetchesFor(refName: string, scopeKind?: BranchScope["kind"]): number {
  return mockRunPlatformQuery.mock.calls.filter(
    (call) => call[2] === refName && (scopeKind === undefined || call[4]?.kind === scopeKind)
  ).length;
}

interface ProbeProps {
  refName: string;
  args: Record<string, unknown> | "skip";
  tenantId: string;
  scope?: BranchScope;
  onResult?: (result: SafeQueryResult<unknown>) => void;
}

function Probe({ refName, args, tenantId, scope = ALL, onResult }: ProbeProps) {
  const result = usePlatformQuery(refName, args, tenantId, scope);
  onResult?.(result);
  return null;
}

function Subscribers({ count, args = {} }: { count: number; args?: Record<string, unknown> }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Probe key={i} refName="orders:getOrders" args={args} tenantId="tenant-1" />
      ))}
    </>
  );
}

beforeEach(() => {
  client = createAppQueryClient();
  mockRunPlatformQuery.mockReset();
  mockRunPlatformQuery.mockResolvedValue([]);
  mockRemoveChannel.mockClear();
  mockChannels.length = 0;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  realtimeHub.teardownAll();
  client.clear();
  (console.error as jest.Mock).mockRestore();
  jest.useRealTimers();
});

describe("usePlatformQuery — loading state", () => {
  it("re-arms isLoading when the query args change", async () => {
    mockRunPlatformQuery.mockResolvedValue("first");
    const { result, rerender } = renderHook(
      ({ args }: { args: Record<string, unknown> }) =>
        usePlatformQuery("orders:getDashboardStatsByPeriod", args, "tenant-1", ALL),
      { initialProps: { args: { startDate: 1 } }, wrapper: wrapperFor(client) }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The next period's fetch is in flight — the screen must say "loading",
    // not present last period's numbers as if they were this period's.
    mockRunPlatformQuery.mockImplementation(() => new Promise(() => {}));
    rerender({ args: { startDate: 2 } });

    expect(result.current.isLoading).toBe(true);
  });

  it("re-arms isLoading when the tenant changes", async () => {
    mockRunPlatformQuery.mockResolvedValue("store-a");
    const { result, rerender } = renderHook(
      ({ tenantId }: { tenantId: string }) =>
        usePlatformQuery("orders:getOrders", {}, tenantId, ALL),
      { initialProps: { tenantId: "tenant-a" }, wrapper: wrapperFor(client) }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockRunPlatformQuery.mockImplementation(() => new Promise(() => {}));
    rerender({ tenantId: "tenant-b" });

    expect(result.current.isLoading).toBe(true);
  });

  it("surfaces an error instead of loading forever when the read hangs", async () => {
    jest.useFakeTimers();
    mockRunPlatformQuery.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(
      () => usePlatformQuery("orders:getOrders", {}, "tenant-1", ALL),
      { wrapper: wrapperFor(client) }
    );

    await act(async () => {
      jest.advanceTimersByTime(13000);
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/timed out/i);
  });

  it("shows no stale data on the first render after a tenant switch", async () => {
    mockRunPlatformQuery.mockResolvedValue(["store-a-order"]);
    const { result, rerender } = renderHook(
      ({ tenantId }: { tenantId: string }) =>
        usePlatformQuery("orders:getOrders", {}, tenantId, ALL),
      { initialProps: { tenantId: "tenant-a" }, wrapper: wrapperFor(client) }
    );
    await waitFor(() => expect(result.current.data).toEqual(["store-a-order"]));

    mockRunPlatformQuery.mockImplementation(() => new Promise(() => {}));
    rerender({ tenantId: "tenant-b" });

    expect(result.current.data).toBeUndefined();
  });

  it("reports a skipped query as not loading and never fetches it", () => {
    const { result } = renderHook(
      () => usePlatformQuery("orders:getOrders", "skip", "tenant-1", ALL),
      { wrapper: wrapperFor(client) }
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockRunPlatformQuery).not.toHaveBeenCalled();
    expect(mockChannels).toHaveLength(0);
  });
});

describe("usePlatformQuery — one cache entry and one channel per identity", () => {
  it("three identical subscribers share one fetch and one channel", async () => {
    render(<Subscribers count={3} />, { wrapper: wrapperFor(client) });

    await waitFor(() => expect(fetchesFor("orders:getOrders")).toBe(1));
    expect(mockChannels).toHaveLength(1);
    expect(mockChannels[0].name).toBe("platform-orders:tenant-1:default");
  });

  it("different limits fetch separately but still share the channel", async () => {
    render(
      <>
        <Probe refName="orders:getOrders" args={{ limit: 200 }} tenantId="tenant-1" />
        <Probe refName="orders:getOrders" args={{ limit: 300 }} tenantId="tenant-1" />
      </>,
      { wrapper: wrapperFor(client) }
    );

    await waitFor(() => expect(fetchesFor("orders:getOrders")).toBe(2));
    expect(mockChannels).toHaveLength(1);
  });

  it("removes the channel once when the last subscriber leaves, not before", async () => {
    const { rerender } = render(<Subscribers count={3} />, { wrapper: wrapperFor(client) });
    await waitFor(() => expect(mockChannels).toHaveLength(1));

    rerender(<Subscribers count={1} />);
    expect(mockRemoveChannel).not.toHaveBeenCalled();

    rerender(<Subscribers count={0} />);
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it("serves a remount within gcTime from cache with no loading state", async () => {
    mockRunPlatformQuery.mockResolvedValue(["cached"]);
    const first = renderHook(() => usePlatformQuery("orders:getOrders", {}, "tenant-1", ALL), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(first.result.current.data).toEqual(["cached"]));
    first.unmount();

    const second = renderHook(() => usePlatformQuery("orders:getOrders", {}, "tenant-1", ALL), {
      wrapper: wrapperFor(client),
    });

    expect(second.result.current.data).toEqual(["cached"]);
    expect(second.result.current.isLoading).toBe(false);
  });
});

describe("usePlatformQuery — realtime", () => {
  it("refetches each affected key once per payload and skips other-branch keys", async () => {
    render(
      <>
        <Probe refName="orders:getOrders" args={{}} tenantId="tenant-1" scope={ALL} />
        <Probe refName="orders:getOrders" args={{}} tenantId="tenant-1" scope={SOUTH} />
        <Probe refName="analytics:getTopItems" args={{}} tenantId="tenant-1" scope={ALL} />
      </>,
      { wrapper: wrapperFor(client) }
    );
    await waitFor(() => expect(mockRunPlatformQuery).toHaveBeenCalledTimes(3));

    await act(async () => {
      mockChannels[0].onCallback?.(NORTH_SALE);
    });

    await waitFor(() => expect(fetchesFor("orders:getOrders", "all")).toBe(2));
    expect(fetchesFor("orders:getOrders", "branch")).toBe(1);
    expect(fetchesFor("analytics:getTopItems")).toBe(1);
  });

  it("slows the poll to 60 s once subscribed without fetching on the status flip", async () => {
    jest.useFakeTimers();
    renderHook(() => usePlatformQuery("orders:getOrders", {}, "tenant-1", ALL), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(fetchesFor("orders:getOrders")).toBe(1));

    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    await waitFor(() => expect(fetchesFor("orders:getOrders")).toBe(2));

    await act(async () => {
      mockChannels[0].statusCallback?.("SUBSCRIBED");
    });
    expect(fetchesFor("orders:getOrders")).toBe(2);

    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(fetchesFor("orders:getOrders")).toBe(2);

    await act(async () => {
      jest.advanceTimersByTime(45_000);
    });
    await waitFor(() => expect(fetchesFor("orders:getOrders")).toBe(3));
  });
});

describe("usePlatformQuery — refetch", () => {
  it("refetch() issues a new read and reports isRefetching while it runs", async () => {
    const { result } = renderHook(() => usePlatformQuery("orders:getOrders", {}, "tenant-1", ALL), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isRefetching).toBe(false);

    let settle: (value: unknown[]) => void = () => {};
    mockRunPlatformQuery.mockImplementation(() => new Promise((resolve) => (settle = resolve)));
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.refetch();
    });
    await waitFor(() => expect(result.current.isRefetching).toBe(true));

    await act(async () => {
      settle(["fresh"]);
      await done;
    });
    await waitFor(() => expect(result.current.data).toEqual(["fresh"]));
    expect(result.current.isRefetching).toBe(false);
    expect(fetchesFor("orders:getOrders")).toBe(2);
  });

  it("refetch() on a skipped query is a no-op", async () => {
    const { result } = renderHook(
      () => usePlatformQuery("orders:getOrders", "skip", "tenant-1", ALL),
      { wrapper: wrapperFor(client) }
    );
    await act(async () => {
      await result.current.refetch();
    });
    expect(mockRunPlatformQuery).not.toHaveBeenCalled();
  });
});

describe("usePlatformQuery — screen focus", () => {
  function focusWrapperFor(queryClient: QueryClient, focusListeners: Array<() => void>) {
    const navigation = {
      addListener: (_event: string, cb: () => void) => {
        focusListeners.push(cb);
        return () => {
          focusListeners.splice(focusListeners.indexOf(cb), 1);
        };
      },
      isFocused: () => true,
    } as unknown as React.ContextType<typeof NavigationContext>;
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>
        </QueryClientProvider>
      );
    };
  }

  it("refetches on focus only once the data is stale", async () => {
    jest.useFakeTimers();
    const focusListeners: Array<() => void> = [];
    const { result } = renderHook(() => usePlatformQuery("orders:getOrders", {}, "tenant-1", ALL), {
      wrapper: focusWrapperFor(client, focusListeners),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchesFor("orders:getOrders")).toBe(1);
    expect(focusListeners).toHaveLength(1);

    await act(async () => {
      focusListeners.forEach((cb) => cb());
    });
    expect(fetchesFor("orders:getOrders")).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(11_000);
    });
    await act(async () => {
      focusListeners.forEach((cb) => cb());
    });
    await waitFor(() => expect(fetchesFor("orders:getOrders")).toBe(2));
  });
});
