/**
 * Cached imperative reads (products, inventory, outlets…).
 *
 * The screens' bespoke `useEffect` + `useState` plumbing gets the same cache the
 * platform path uses: one fetch per key however many callers, the app's own
 * result shape, and a mutation-side `invalidateResource` so a save elsewhere
 * shows up without a manual reload.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createAppQueryClient } from "./query-client";
import { invalidateResource, useResource } from "./use-resource";
import { resourceKey } from "../backends/query-keys";

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = createAppQueryClient();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  (console.error as jest.Mock).mockRestore();
});

describe("useResource", () => {
  it("shares one fetch between callers of the same key", async () => {
    const fetcher = jest.fn(async () => ["p1"]);
    const { result } = renderHook(
      () => ({
        a: useResource(resourceKey("products", "t1"), fetcher),
        b: useResource(resourceKey("products", "t1"), fetcher),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.a.isLoading).toBe(false));
    expect(result.current.a.data).toEqual(["p1"]);
    expect(result.current.b.data).toEqual(["p1"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports when the data landed, and 0 before any read", async () => {
    const fetcher = jest.fn(async () => ["p1"]);
    const { result } = renderHook(() => useResource(resourceKey("products", "t1"), fetcher), {
      wrapper,
    });
    expect(result.current.dataUpdatedAt).toBe(0);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.dataUpdatedAt).toBeGreaterThan(0);
  });

  it("is idle, not loading, on a null key", () => {
    const fetcher = jest.fn(async () => ["p1"]);
    const { result } = renderHook(() => useResource(null, fetcher), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces a failed read as a message", async () => {
    const fetcher = jest.fn(async () => {
      throw new Error("permission denied");
    });
    const { result } = renderHook(() => useResource(resourceKey("products", "t1"), fetcher), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("permission denied");
  });

  it("refetch() reads again", async () => {
    const fetcher = jest.fn(async () => ["p1"]);
    const { result } = renderHook(() => useResource(resourceKey("products", "t1"), fetcher), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.refetch();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.isRefetching).toBe(false);
  });
});

describe("invalidateResource", () => {
  it("refetches the named resource for the tenant and leaves others alone", async () => {
    const products = jest.fn(async () => ["p1"]);
    const outlets = jest.fn(async () => ["o1"]);
    const otherTenant = jest.fn(async () => ["p2"]);
    const { result } = renderHook(
      () => ({
        products: useResource(resourceKey("products", "t1"), products),
        outlets: useResource(resourceKey("outlets", "t1"), outlets),
        other: useResource(resourceKey("products", "t2"), otherTenant),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.other.isLoading).toBe(false));

    await act(async () => {
      await invalidateResource(client, "products", "t1");
    });

    expect(products).toHaveBeenCalledTimes(2);
    expect(outlets).toHaveBeenCalledTimes(1);
    expect(otherTenant).toHaveBeenCalledTimes(1);
  });

  it("refetches every tenant's copy when no tenant is given", async () => {
    const a = jest.fn(async () => ["a"]);
    const b = jest.fn(async () => ["b"]);
    const { result } = renderHook(
      () => ({
        a: useResource(resourceKey("products", "t1"), a),
        b: useResource(resourceKey("products", "t2"), b),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.b.isLoading).toBe(false));

    await act(async () => {
      await invalidateResource(client, "products");
    });

    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
  });
});
