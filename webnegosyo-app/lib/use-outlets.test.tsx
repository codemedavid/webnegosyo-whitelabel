/**
 * `useOutlets` on the shared cache.
 *
 * Six screens read the branch list; the cache turns that into one request per
 * tenant, and a screen mounting into a warm cache still publishes the known
 * branch ids (its fetcher never runs, so the publish cannot live there).
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

let mockQueued: { data: unknown; error: unknown }[] = [];
let mockSelectCalls = 0;

jest.mock("./supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    chain[method] = () => {
      if (method === "select") mockSelectCalls += 1;
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(mockQueued.shift() ?? { data: [], error: null }).then(resolve);
  return { supabase: { from: () => chain } };
});

import { createAppQueryClient } from "./query/query-client";
import { useAuthStore } from "../stores/auth-store";
import { useBranchContextStore } from "../stores/branch-context-store";
import { useOutlets } from "./use-outlets";

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const NORTH = { id: "o-north", name: "North" };
const SOUTH = { id: "o-south", name: "South" };

beforeEach(() => {
  client = createAppQueryClient();
  mockQueued = [];
  mockSelectCalls = 0;
  useAuthStore.getState().clear();
  useBranchContextStore.getState().clear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  (console.error as jest.Mock).mockRestore();
});

describe("useOutlets", () => {
  it("is idle with no branches when no tenant is in scope", () => {
    const { result } = renderHook(() => useOutlets(), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.outlets).toEqual([]);
    expect(mockSelectCalls).toBe(0);
  });

  it("shares one read between callers and publishes the known branch ids", async () => {
    useAuthStore.getState().setAuth({ tenantId: "t1" });
    mockQueued = [{ data: [NORTH, SOUTH], error: null }];

    const { result } = renderHook(() => ({ a: useOutlets(), b: useOutlets() }), { wrapper });

    await waitFor(() => expect(result.current.a.isLoading).toBe(false));
    expect(result.current.a.outlets).toEqual([NORTH, SOUTH]);
    expect(result.current.b.outlets).toEqual([NORTH, SOUTH]);
    expect(mockSelectCalls).toBe(1);
    expect(useBranchContextStore.getState().knownOutletIds).toEqual(["o-north", "o-south"]);
  });

  it("publishes the ids for a caller mounting into a warm cache", async () => {
    useAuthStore.getState().setAuth({ tenantId: "t1" });
    mockQueued = [{ data: [NORTH], error: null }];
    const first = renderHook(() => useOutlets(), { wrapper });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();
    useBranchContextStore.getState().clear();

    const second = renderHook(() => useOutlets(), { wrapper });
    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.outlets).toEqual([NORTH]);
    await waitFor(() =>
      expect(useBranchContextStore.getState().knownOutletIds).toEqual(["o-north"])
    );
    expect(mockSelectCalls).toBe(1);
  });

  it("surfaces a failed read as a merchant-facing message, never an empty list", async () => {
    useAuthStore.getState().setAuth({ tenantId: "t1" });
    mockQueued = [{ data: null, error: { message: "permission denied" } }];

    const { result } = renderHook(() => useOutlets(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Could not load your branches");
    expect(result.current.outlets).toEqual([]);
  });

  it("reload() reads again", async () => {
    useAuthStore.getState().setAuth({ tenantId: "t1" });
    mockQueued = [{ data: [NORTH], error: null }, { data: [NORTH, SOUTH], error: null }];
    const { result } = renderHook(() => useOutlets(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.outlets).toEqual([NORTH, SOUTH]));
    expect(mockSelectCalls).toBe(2);
  });
});
