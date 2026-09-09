/**
 * The register's catalog on the shared cache: products (per branch), the
 * categories, and the order types. Three callers, one read each; a save
 * elsewhere invalidates by name.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

const mockListProducts = jest.fn();
const mockListCategories = jest.fn();
const mockListOrderTypes = jest.fn();
jest.mock("../products", () => ({
  listProducts: (...args: unknown[]) => mockListProducts(...args),
  listCategories: (...args: unknown[]) => mockListCategories(...args),
}));
jest.mock("../pos-catalog", () => ({
  listOrderTypes: (...args: unknown[]) => mockListOrderTypes(...args),
}));

import { createAppQueryClient } from "./query-client";
import { buildRegisterItems, invalidatePosCatalog, usePosCatalog } from "./use-pos-catalog";
import { useOrderTypes } from "./use-order-types";

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const LATTE = { id: "p1", name: "Latte", is_available: true, price: 120 };
const SOLD_OUT = { id: "p2", name: "Cake", is_available: false, price: 90 };
const DINE_IN = { id: "t1", type: "dine_in", name: "Dine in", serviceCharge: undefined };

beforeEach(() => {
  client = createAppQueryClient();
  mockListProducts.mockReset().mockResolvedValue([LATTE, SOLD_OUT]);
  mockListCategories.mockReset().mockResolvedValue([{ id: "c1", name: "Drinks" }]);
  mockListOrderTypes.mockReset().mockResolvedValue([DINE_IN]);
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  (console.error as jest.Mock).mockRestore();
});

describe("buildRegisterItems", () => {
  it("keeps only available products and normalises their modifier groups", () => {
    const items = buildRegisterItems([LATTE, SOLD_OUT] as never);
    expect(items.map((item) => item.product.id)).toEqual(["p1"]);
    expect(items[0].groups).toEqual([]);
  });
});

describe("usePosCatalog", () => {
  it("is idle without a tenant", () => {
    const { result } = renderHook(() => usePosCatalog(null, null), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(mockListProducts).not.toHaveBeenCalled();
  });

  it("reads the branch's products once for two callers", async () => {
    const { result } = renderHook(
      () => ({ a: usePosCatalog("t1", "o-north"), b: usePosCatalog("t1", "o-north") }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.a.isLoading).toBe(false));

    expect(mockListProducts).toHaveBeenCalledTimes(1);
    expect(mockListProducts).toHaveBeenCalledWith("t1", "o-north");
    expect(result.current.b.data?.items.map((i) => i.product.id)).toEqual(["p1"]);
    expect(result.current.b.data?.categories).toEqual([{ id: "c1", name: "Drinks" }]);
  });

  it("keeps the store-wide menu on a different key from a branch's", async () => {
    const { result } = renderHook(
      () => ({ store: usePosCatalog("t1", null), branch: usePosCatalog("t1", "o-north") }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.branch.isLoading).toBe(false));
    expect(mockListProducts).toHaveBeenCalledTimes(2);
  });

  it("invalidatePosCatalog re-reads the tenant's menu", async () => {
    const { result } = renderHook(() => usePosCatalog("t1", null), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await invalidatePosCatalog(client, "t1");
    });
    expect(mockListProducts).toHaveBeenCalledTimes(2);
  });
});

describe("useOrderTypes", () => {
  it("shares one read and reports when the data landed", async () => {
    const { result } = renderHook(
      () => ({ a: useOrderTypes("t1"), b: useOrderTypes("t1") }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.a.isLoading).toBe(false));

    expect(mockListOrderTypes).toHaveBeenCalledTimes(1);
    expect(result.current.b.data).toEqual([DINE_IN]);
    expect(result.current.b.dataUpdatedAt).toBeGreaterThan(0);
  });
});
