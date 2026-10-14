import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

import { createAppQueryClient } from "../query/query-client";
import type { ActivityRpcClient, RpcResult } from "./activity-repo";
import { useActivityFeed } from "./use-activity-feed";
import { useActivitySummary, useOrderActivity } from "./use-activity-summary";

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function row(id: string, occurredAt: string): Record<string, unknown> {
  return {
    id,
    outlet_id: null,
    outlet_name: null,
    occurred_at: occurredAt,
    category: "stock",
    kind: "stock.received",
    is_routine: false,
    actor_user_id: "u1",
    actor_name: "Ana",
    approved_by_name: null,
    amount: null,
    quantity: 2,
    unit: "kg",
    reason: null,
    note: null,
    subject_type: null,
    subject_ref: null,
    order_number: null,
    before: null,
    after: null,
    summary: {},
    flags: [],
    reviewed_at: null,
    reviewed_by_name: null,
  };
}

function scriptedClient(script: (fn: string, args: Record<string, unknown>) => RpcResult): {
  rpcClient: ActivityRpcClient;
  calls: { fn: string; args: Record<string, unknown> }[];
} {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpcClient: {
      rpc: (fn, args) => {
        calls.push({ fn, args });
        return Promise.resolve(script(fn, args));
      },
    },
  };
}

const QUERY = { tenantId: "t1", since: "2026-10-05T16:00:00.000Z", until: null, categories: [] };

beforeEach(() => {
  client = createAppQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  (console.error as jest.Mock).mockRestore();
});

describe("useActivityFeed", () => {
  it("loads a page and pages on with the keyset cursor", async () => {
    // Arrange: page size 2, so the first page is full and there is a next one.
    const { rpcClient, calls } = scriptedClient((_fn, args) =>
      args.p_before_id === null
        ? { data: [row("a", "2026-10-12T04:00:00.000001+00:00"), row("b", "2026-10-12T03:00:00.000002+00:00")], error: null }
        : { data: [row("c", "2026-10-12T02:00:00+00:00")], error: null },
    );

    // Act
    const { result } = renderHook(() => useActivityFeed(QUERY, { client: rpcClient, pageSize: 2 }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.events).toHaveLength(3));

    // Assert
    expect(result.current.events.map((event) => event.id)).toEqual(["a", "b", "c"]);
    expect(calls[1].args.p_before_occurred_at).toBe("2026-10-12T03:00:00.000002+00:00");
    expect(calls[1].args.p_before_id).toBe("b");
    expect(result.current.hasNextPage).toBe(false);
  });

  it("keeps the rows it had when a refresh fails, and says so", async () => {
    let shouldFail = false;
    const { rpcClient } = scriptedClient(() =>
      shouldFail ? { data: null, error: { message: "Network request failed" } } : { data: [row("a", "2026-10-12T04:00:00+00:00")], error: null },
    );
    const { result } = renderHook(() => useActivityFeed(QUERY, { client: rpcClient }), { wrapper });
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    shouldFail = true;
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.events).toHaveLength(1);
    expect(result.current.isShowingStale).toBe(true);
  });

  it("reports a database without the activity functions as unavailable, not as broken", async () => {
    const { rpcClient } = scriptedClient(() => ({ data: null, error: { message: "not found", code: "PGRST202" } }));
    const { result } = renderHook(() => useActivityFeed(QUERY, { client: rpcClient }), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.isUnavailable).toBe(true);
  });

  it("refetches when the connection comes back", async () => {
    const { rpcClient, calls } = scriptedClient(() => ({ data: [], error: null }));
    const { result, rerender } = renderHook(
      ({ isOnline }: { isOnline: boolean }) => useActivityFeed(QUERY, { client: rpcClient, isOnline }),
      { wrapper, initialProps: { isOnline: true } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender({ isOnline: false });
    rerender({ isOnline: true });
    await waitFor(() => expect(calls.length).toBe(2));
  });

  it("stays idle without a query", () => {
    const { rpcClient, calls } = scriptedClient(() => ({ data: [], error: null }));
    const { result } = renderHook(() => useActivityFeed(null, { client: rpcClient }), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("useActivitySummary", () => {
  it("reads the period, the trailing baseline and the period's order + cash rows", async () => {
    const summaryData = { byKind: [], byActor: [], byDay: [], routine: [], flaggedOpen: 1 };
    const { rpcClient, calls } = scriptedClient((fn) =>
      fn === "get_store_activity_summary" ? { data: summaryData, error: null } : { data: [], error: null },
    );
    const { result } = renderHook(
      () =>
        useActivitySummary(
          {
            tenantId: "t1",
            since: "2026-10-11T16:00:00.000Z",
            until: "2026-10-12T04:41:00.000Z",
            baselineSince: "2026-09-14T16:00:00.000Z",
            outletId: null,
          },
          { client: rpcClient },
        ),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.current?.flaggedOpen).toBe(1);
    expect(result.current.baseline?.flaggedOpen).toBe(1);
    expect(result.current.isRowsPartial).toBe(false);
    const rowsCall = calls.find((call) => call.fn === "get_store_activity");
    expect(rowsCall?.args.p_categories).toEqual(["orders", "cash"]);
    expect(rowsCall?.args.p_limit).toBe(100);
  });
});

describe("useOrderActivity", () => {
  it("asks for one order's whole story, routine events included, bounded by when it was placed", async () => {
    const { rpcClient, calls } = scriptedClient(() => ({ data: [row("a", "2026-10-12T04:00:00+00:00")], error: null }));
    const { result } = renderHook(
      () => useOrderActivity({ tenantId: "t1", orderId: "o1", placedAt: "2026-10-12T03:00:00.000Z" }, { client: rpcClient }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(calls[0].args).toMatchObject({
      p_subject_type: "order",
      p_subject_ref: "o1",
      p_include_routine: true,
      p_since: "2026-10-12T02:00:00.000Z",
    });
  });
});
