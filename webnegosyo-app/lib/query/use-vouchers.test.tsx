/**
 * Vouchers on the shared cache: the list the Vouchers tab shows, the one
 * voucher the editor opens, its recent uses, and the invalidation every write
 * calls so the list is current when the merchant comes back to it.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

const mockList = jest.fn();
const mockGet = jest.fn();
const mockUses = jest.fn();
jest.mock("../voucher-admin/voucher-repository", () => ({
  listManagedVouchers: (...args: unknown[]) => mockList(...args),
  getManagedVoucher: (...args: unknown[]) => mockGet(...args),
  listVoucherRedemptions: (...args: unknown[]) => mockUses(...args),
}));

import { createAppQueryClient } from "./query-client";
import {
  invalidateVouchers,
  useVoucher,
  useVoucherRedemptions,
  useVouchers,
} from "./use-vouchers";
import type { Voucher } from "../vouchers/types";

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const SAVE10 = { id: "v1", code: "SAVE10", isActive: true } as Voucher;

beforeEach(() => {
  client = createAppQueryClient();
  mockList.mockReset().mockResolvedValue([SAVE10]);
  mockGet.mockReset().mockResolvedValue(SAVE10);
  mockUses.mockReset().mockResolvedValue([]);
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  (console.error as jest.Mock).mockRestore();
});

describe("useVouchers", () => {
  it("is idle without a tenant", () => {
    const { result } = renderHook(() => useVouchers(null), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.vouchers).toEqual([]);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("reads the list once and patches it in place for an optimistic switch", async () => {
    const { result } = renderHook(() => useVouchers("t1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.vouchers).toEqual([SAVE10]);

    act(() => {
      result.current.patch((vouchers) => vouchers.map((v) => ({ ...v, isActive: false })));
    });
    await waitFor(() => expect(result.current.vouchers[0].isActive).toBe(false));
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("invalidate() re-reads the list, the open voucher and its uses", async () => {
    const { result } = renderHook(
      () => ({
        list: useVouchers("t1"),
        one: useVoucher("t1", "v1"),
        uses: useVoucherRedemptions("t1", "v1"),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.uses.isLoading).toBe(false));
    await waitFor(() => expect(result.current.one.isLoading).toBe(false));

    await act(async () => {
      await result.current.list.invalidate();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockUses).toHaveBeenCalledTimes(2);
  });

  it("surfaces a failed read as a message", async () => {
    mockList.mockRejectedValueOnce(new Error("permission denied"));
    const { result } = renderHook(() => useVouchers("t1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("permission denied");
  });
});

describe("useVoucher", () => {
  it("does not read for a new voucher", () => {
    const { result } = renderHook(() => useVoucher("t1", null), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("is reached by invalidateVouchers when loaded on its own", async () => {
    const { result } = renderHook(() => useVoucher("t1", "v1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith("v1", "t1");

    await act(async () => {
      await invalidateVouchers(client, "t1");
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
