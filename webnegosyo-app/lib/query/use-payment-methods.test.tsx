/**
 * Payment methods on the shared cache: the list the Payments tab shows, the
 * one row the editor opens, and the invalidation both write paths call so a
 * save on the editor is visible on the list when the merchant returns.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

const mockList = jest.fn();
const mockGet = jest.fn();
jest.mock("../payment-methods", () => ({
  listManagedPaymentMethods: (...args: unknown[]) => mockList(...args),
  getPaymentMethod: (...args: unknown[]) => mockGet(...args),
}));

import { createAppQueryClient } from "./query-client";
import { invalidatePaymentMethods, usePaymentMethod, usePaymentMethods } from "./use-payment-methods";
import type { ManagedPaymentMethod } from "../payment-methods";

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const GCASH = { id: "m1", name: "GCash", is_active: true } as ManagedPaymentMethod;

beforeEach(() => {
  client = createAppQueryClient();
  mockList.mockReset().mockResolvedValue([GCASH]);
  mockGet.mockReset().mockResolvedValue(GCASH);
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  (console.error as jest.Mock).mockRestore();
});

describe("usePaymentMethods", () => {
  it("is idle without a tenant", () => {
    const { result } = renderHook(() => usePaymentMethods(null), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.methods).toEqual([]);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("reads the list once and patches it in place for an optimistic toggle", async () => {
    const { result } = renderHook(() => usePaymentMethods("t1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.methods).toEqual([GCASH]);

    act(() => {
      result.current.patch((methods) => methods.map((m) => ({ ...m, is_active: false })));
    });
    // The cache notifies its observers on a scheduled batch, so the patched
    // value reaches this render a tick after the write.
    await waitFor(() => expect(result.current.methods[0].is_active).toBe(false));
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("invalidate() re-reads the list and the open row", async () => {
    const { result } = renderHook(
      () => ({ list: usePaymentMethods("t1"), row: usePaymentMethod("t1", "m1") }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.row.isLoading).toBe(false));

    await act(async () => {
      await result.current.list.invalidate();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("surfaces a failed read as a message", async () => {
    mockList.mockRejectedValueOnce(new Error("permission denied"));
    const { result } = renderHook(() => usePaymentMethods("t1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("permission denied");
  });
});

describe("usePaymentMethod", () => {
  it("does not read for a new method", () => {
    const { result } = renderHook(() => usePaymentMethod("t1", null), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("invalidatePaymentMethods reaches a row loaded on its own", async () => {
    const { result } = renderHook(() => usePaymentMethod("t1", "m1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith("m1", "t1");

    await act(async () => {
      await invalidatePaymentMethods(client, "t1");
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
