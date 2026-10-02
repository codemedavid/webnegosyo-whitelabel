/**
 * The tender screen's payment methods, on the shared cache.
 *
 * They used to be fetched on every visit, behind a full-screen "Loading
 * sale..." spinner — a network round trip between tapping Charge and seeing
 * the amount due. Then they were cached per order type, which left an offline
 * register with no methods for any type it had not charged online. Now ONE
 * read carries every method with its order-type links; the order type is
 * applied on the device, so one saved copy covers every channel.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

const mockListRegister = jest.fn();
jest.mock("../pos-catalog", () => ({
  listRegisterPaymentMethods: (...args: unknown[]) => mockListRegister(...args),
}));
jest.mock("../payment-methods", () => ({
  listManagedPaymentMethods: jest.fn(),
  getPaymentMethod: jest.fn(),
}));

import { createAppQueryClient } from "./query-client";
import { useTenderPaymentMethods } from "./use-tender-payment-methods";
import { invalidatePaymentMethods } from "./use-payment-methods";

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function method(id: string, orderTypeIds: string[]) {
  return {
    id,
    name: id,
    details: null,
    qr_code_url: null,
    require_payment_proof: false,
    order_index: 0,
    orderTypeIds,
  };
}

const CASH = method("cash", ["ot-1", "ot-2"]);
const GCASH = method("gcash", ["ot-2"]);
const BANK = method("bank", []);

const ids = (methods: { id: string }[]) => methods.map((m) => m.id);

beforeEach(() => {
  client = createAppQueryClient();
  mockListRegister.mockReset().mockResolvedValue([CASH, GCASH, BANK]);
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  (console.error as jest.Mock).mockRestore();
});

describe("useTenderPaymentMethods", () => {
  it("offers the order type's methods for a new sale", async () => {
    const { result } = renderHook(() => useTenderPaymentMethods("t1", "ot-1", false), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(ids(result.current.methods)).toEqual(["cash"]);
    expect(mockListRegister).toHaveBeenCalledWith("t1");
  });

  it("offers every method when settling an edit", async () => {
    const { result } = renderHook(() => useTenderPaymentMethods("t1", "ot-1", true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(ids(result.current.methods)).toEqual(["cash", "gcash", "bank"]);
  });

  it("switches order type without another read — one copy covers every channel", async () => {
    const { result, rerender } = renderHook(
      ({ orderTypeId }: { orderTypeId: string }) => useTenderPaymentMethods("t1", orderTypeId, false),
      { wrapper, initialProps: { orderTypeId: "ot-1" } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender({ orderTypeId: "ot-2" });
    expect(result.current.isLoading).toBe(false);
    expect(ids(result.current.methods)).toEqual(["cash", "gcash"]);
    expect(mockListRegister).toHaveBeenCalledTimes(1);
  });

  it("serves the second checkout from the cache without a loading state", async () => {
    const first = renderHook(() => useTenderPaymentMethods("t1", "ot-1", false), { wrapper });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => useTenderPaymentMethods("t1", "ot-1", false), { wrapper });
    expect(second.result.current.isLoading).toBe(false);
    expect(ids(second.result.current.methods)).toEqual(["cash"]);
    expect(mockListRegister).toHaveBeenCalledTimes(1);
  });

  it("warms the cache before an order type is chosen, but offers nothing yet", async () => {
    const { result } = renderHook(() => useTenderPaymentMethods("t1", null, false), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.methods).toEqual([]);
    expect(mockListRegister).toHaveBeenCalledTimes(1);
  });

  it("is idle without a tenant", () => {
    const { result } = renderHook(() => useTenderPaymentMethods(null, "ot-1", false), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.methods).toEqual([]);
    expect(mockListRegister).not.toHaveBeenCalled();
  });

  it("surfaces a failed read, so the screen never claims no method is enabled", async () => {
    mockListRegister.mockRejectedValue(new Error("permission denied"));
    const { result } = renderHook(() => useTenderPaymentMethods("t1", "ot-1", false), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("permission denied");
    expect(result.current.methods).toEqual([]);
  });

  it("re-reads after the merchant edits their methods", async () => {
    const { result } = renderHook(() => useTenderPaymentMethods("t1", "ot-1", false), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockListRegister.mockResolvedValue([CASH, method("maya", ["ot-1"])]);
    await act(async () => {
      await invalidatePaymentMethods(client, "t1");
    });
    await waitFor(() => expect(ids(result.current.methods)).toEqual(["cash", "maya"]));
  });
});
