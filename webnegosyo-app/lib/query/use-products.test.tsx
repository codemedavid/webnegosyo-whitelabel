/**
 * The menu catalog on the shared cache.
 *
 * Products, categories and branch overrides are read by the product list, the
 * branch menu, the register and the analytics screen. One cache entry per
 * tenant per read, invalidated together after a save, so a product added on
 * one screen is on every other without a manual reload.
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

const mockListProducts = jest.fn();
const mockListCategories = jest.fn();
const mockListOverrides = jest.fn();

jest.mock("../products", () => ({
  listProducts: (...args: unknown[]) => mockListProducts(...args),
  listCategories: (...args: unknown[]) => mockListCategories(...args),
}));
jest.mock("../branch-menu-service", () => ({
  listBranchMenuOverrides: (...args: unknown[]) => mockListOverrides(...args),
}));

import { createAppQueryClient } from "./query-client";
import { usePosCatalog } from "./use-pos-catalog";
import {
  applyBranchListing,
  applyProductAvailability,
  invalidateMenuCatalog,
  useBranchMenuOverrides,
  useCategories,
  useMenuCatalogCache,
  useMenuCatalog,
  useProducts,
} from "./use-products";

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const ADOBO = { id: "p1", name: "Adobo" };
const MAINS = { id: "c1", name: "Mains" };
const OVERRIDE = {
  outlet_id: "o1",
  menu_item_id: "p1",
  is_listed: false,
  is_available: true,
  price: null,
  discounted_price: null,
  discount_cleared: false,
};

beforeEach(() => {
  client = createAppQueryClient();
  mockListProducts.mockReset().mockResolvedValue([ADOBO]);
  mockListCategories.mockReset().mockResolvedValue([MAINS]);
  mockListOverrides.mockReset().mockResolvedValue([OVERRIDE]);
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  (console.error as jest.Mock).mockRestore();
});

describe("menu catalog hooks", () => {
  it("are idle without a tenant", () => {
    const { result } = renderHook(
      () => ({
        products: useProducts(null),
        categories: useCategories(null),
        overrides: useBranchMenuOverrides(null),
      }),
      { wrapper }
    );
    expect(result.current.products.isLoading).toBe(false);
    expect(result.current.categories.data).toBeUndefined();
    expect(result.current.overrides.data).toBeUndefined();
    expect(mockListProducts).not.toHaveBeenCalled();
    expect(mockListCategories).not.toHaveBeenCalled();
    expect(mockListOverrides).not.toHaveBeenCalled();
  });

  it("share one read per tenant between callers", async () => {
    const { result } = renderHook(
      () => ({ a: useProducts("t1"), b: useProducts("t1"), c: useCategories("t1") }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.a.isLoading).toBe(false));
    await waitFor(() => expect(result.current.c.isLoading).toBe(false));
    expect(result.current.a.data).toEqual([ADOBO]);
    expect(result.current.b.data).toEqual([ADOBO]);
    expect(result.current.c.data).toEqual([MAINS]);
    expect(mockListProducts).toHaveBeenCalledTimes(1);
    expect(mockListProducts).toHaveBeenCalledWith("t1");
    expect(mockListCategories).toHaveBeenCalledTimes(1);
  });

  it("useMenuCatalog folds the three reads into one loading/error/refetch", async () => {
    mockListOverrides.mockRejectedValueOnce(new Error("Could not load overrides"));
    const { result } = renderHook(() => useMenuCatalog("t1"), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.products).toEqual([ADOBO]);
    expect(result.current.categories).toEqual([MAINS]);
    expect(result.current.overrides).toEqual([]);
    expect(result.current.error).toBe("Could not load overrides");

    await act(async () => {
      await result.current.refetch();
    });
    expect(mockListProducts).toHaveBeenCalledTimes(2);
    expect(mockListCategories).toHaveBeenCalledTimes(2);
    expect(mockListOverrides).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.overrides).toEqual([OVERRIDE]));
    expect(result.current.error).toBeNull();
    expect(result.current.dataUpdatedAt).toBeGreaterThan(0);
  });
});

describe("invalidateMenuCatalog", () => {
  it("refetches every catalog read of that tenant and no other", async () => {
    const { result } = renderHook(
      () => ({
        t1: useMenuCatalog("t1"),
        t2: useProducts("t2"),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.t1.isLoading).toBe(false));
    await waitFor(() => expect(result.current.t2.isLoading).toBe(false));

    await act(async () => {
      await invalidateMenuCatalog(client, "t1");
    });

    // t1: products, categories, overrides once more each; t2 untouched.
    expect(mockListProducts).toHaveBeenCalledTimes(3);
    expect(mockListProducts.mock.calls.map((c) => c[0])).toEqual(["t1", "t2", "t1"]);
    expect(mockListCategories).toHaveBeenCalledTimes(2);
    expect(mockListOverrides).toHaveBeenCalledTimes(2);
  });

  it("re-reads the REGISTER's menu too, so a new dish is sellable without a restart", async () => {
    const { result } = renderHook(
      () => ({ list: useProducts("t1"), register: usePosCatalog("t1", "o1") }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.list.isLoading).toBe(false));
    await waitFor(() => expect(result.current.register.isLoading).toBe(false));
    mockListProducts.mockClear();

    await act(async () => {
      await invalidateMenuCatalog(client, "t1");
    });

    // Both copies re-read: the management list store-wide, the register on its
    // own branch key. Missing the second is the register showing yesterday's
    // menu until the cashier force-quits the app.
    const outletArgs = mockListProducts.mock.calls.map((call) => call[1] ?? "store-wide");
    expect(outletArgs.sort()).toEqual(["o1", "store-wide"]);
  });
});

describe("applyBranchListing", () => {
  it("flips an existing override without mutating the input", () => {
    const rows = [OVERRIDE];
    const next = applyBranchListing(rows, "o1", "p1", true);
    expect(next).toEqual([{ ...OVERRIDE, is_listed: true }]);
    expect(rows[0].is_listed).toBe(false);
    expect(next).not.toBe(rows);
  });

  it("adds a store-default row for a branch with no override yet", () => {
    const next = applyBranchListing([OVERRIDE], "o2", "p1", false);
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ ...OVERRIDE, outlet_id: "o2", is_listed: false });
  });
});

describe("applyProductAvailability", () => {
  it("switches one dish without mutating the list", () => {
    const rows = [{ ...ADOBO, is_available: true }, { id: "p2", name: "Sisig", is_available: true }];
    const next = applyProductAvailability(rows as never, "p1", false);
    expect(next.map((p) => p.is_available)).toEqual([false, true]);
    expect(rows[0].is_available).toBe(true);
  });
});

describe("useMenuCatalogCache", () => {
  it("patches a dish's availability optimistically and rolls it back", async () => {
    mockListProducts.mockResolvedValue([{ ...ADOBO, is_available: true }]);
    const { result } = renderHook(
      () => ({ products: useProducts("t1"), cache: useMenuCatalogCache() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.products.isLoading).toBe(false));

    let rollback: () => void = () => {};
    act(() => {
      rollback = result.current.cache.patchProductAvailability("t1", "p1", false);
    });
    await waitFor(() => expect(result.current.products.data?.[0].is_available).toBe(false));

    act(() => rollback());
    await waitFor(() => expect(result.current.products.data?.[0].is_available).toBe(true));
  });

  it("patches the cached overrides optimistically and rolls them back", async () => {
    const { result } = renderHook(
      () => ({ overrides: useBranchMenuOverrides("t1"), cache: useMenuCatalogCache() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.overrides.isLoading).toBe(false));

    let rollback: () => void = () => {};
    act(() => {
      rollback = result.current.cache.patchBranchListing("t1", "o1", "p1", true);
    });
    await waitFor(() =>
      expect(result.current.overrides.data).toEqual([{ ...OVERRIDE, is_listed: true }])
    );

    act(() => rollback());
    await waitFor(() => expect(result.current.overrides.data).toEqual([OVERRIDE]));
  });

  it("invalidate() refetches the tenant's catalog", async () => {
    const { result } = renderHook(
      () => ({ products: useProducts("t1"), cache: useMenuCatalogCache() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.products.isLoading).toBe(false));
    await act(async () => {
      await result.current.cache.invalidate("t1");
    });
    expect(mockListProducts).toHaveBeenCalledTimes(2);
  });
});
