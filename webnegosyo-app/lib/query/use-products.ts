/**
 * The menu catalog on the shared cache.
 *
 * Products, categories and branch overrides are read by the product list, the
 * branch menu, the register and the analytics screen, and each used to carry
 * its own `useEffect` + `useState` copy that never learned about a save made
 * elsewhere. Here each read is one cache entry per tenant, and a mutation
 * calls `invalidateMenuCatalog` once so every screen re-reads together.
 *
 * Screens reach the cache only through this module (`useMenuCatalogCache`),
 * which is what keeps the "no screen imports TanStack" guardrail true.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";
import { resourceKey, type ResourceQueryKey } from "../backends/query-keys";
import { listCategories, listProducts, type Category, type Product } from "../products";
import { listBranchMenuOverrides } from "../branch-menu-service";
import { POS_CATALOG_RESOURCE } from "./use-pos-catalog";
import type { OutletMenuOverrideRow } from "../outlet-menu-overrides";
import { invalidateResource, useResource, type ResourceResult } from "./use-resource";

export const PRODUCTS_RESOURCE = "products";
export const CATEGORIES_RESOURCE = "categories";
export const BRANCH_MENU_OVERRIDES_RESOURCE = "branch-menu-overrides";

/**
 * The register's own copy is invalidated with the rest: it is keyed by branch
 * and lives on a different key, and leaving it out meant a dish added in the
 * editor was not sellable until the app was force-quit.
 */
const CATALOG_RESOURCES = [
  PRODUCTS_RESOURCE,
  CATEGORIES_RESOURCE,
  BRANCH_MENU_OVERRIDES_RESOURCE,
  POS_CATALOG_RESOURCE,
] as const;

const NO_PRODUCTS: Product[] = [];
const NO_CATEGORIES: Category[] = [];
const NO_OVERRIDES: OutletMenuOverrideRow[] = [];

/** The store-wide product list (see `listProducts`). */
export function useProducts(tenantId: string | null): ResourceResult<Product[]> {
  const fetcher = useCallback(() => listProducts(tenantId as string), [tenantId]);
  return useResource(tenantId ? resourceKey(PRODUCTS_RESOURCE, tenantId) : null, fetcher);
}

/** The store's categories in menu order (see `listCategories`). */
export function useCategories(tenantId: string | null): ResourceResult<Category[]> {
  const fetcher = useCallback(() => listCategories(tenantId as string), [tenantId]);
  return useResource(tenantId ? resourceKey(CATEGORIES_RESOURCE, tenantId) : null, fetcher);
}

/** Every branch's differences from the store-wide menu (see `listBranchMenuOverrides`). */
export function useBranchMenuOverrides(
  tenantId: string | null
): ResourceResult<OutletMenuOverrideRow[]> {
  const fetcher = useCallback(() => listBranchMenuOverrides(tenantId as string), [tenantId]);
  return useResource(
    tenantId ? resourceKey(BRANCH_MENU_OVERRIDES_RESOURCE, tenantId) : null,
    fetcher
  );
}

export interface MenuCatalog {
  products: Product[];
  categories: Category[];
  overrides: OutletMenuOverrideRow[];
  /** True until all three reads have answered, success or failure. */
  isLoading: boolean;
  /** The first failed read's message, or null. */
  error: string | null;
  /** Re-read all three; resolves when every read has landed. */
  refetch: () => Promise<void>;
  isRefetching: boolean;
  /** The oldest of the three reads' landing times; `0` until all have landed. */
  dataUpdatedAt: number;
}

/** The three catalog reads folded into one result for screens that need them all. */
export function useMenuCatalog(tenantId: string | null): MenuCatalog {
  const products = useProducts(tenantId);
  const categories = useCategories(tenantId);
  const overrides = useBranchMenuOverrides(tenantId);

  const { refetch: refetchProducts } = products;
  const { refetch: refetchCategories } = categories;
  const { refetch: refetchOverrides } = overrides;
  const refetch = useCallback(async () => {
    await Promise.all([refetchProducts(), refetchCategories(), refetchOverrides()]);
  }, [refetchProducts, refetchCategories, refetchOverrides]);

  return useMemo(
    () => ({
      products: products.data ?? NO_PRODUCTS,
      categories: categories.data ?? NO_CATEGORIES,
      overrides: overrides.data ?? NO_OVERRIDES,
      isLoading: products.isLoading || categories.isLoading || overrides.isLoading,
      error: products.error ?? categories.error ?? overrides.error,
      refetch,
      isRefetching: products.isRefetching || categories.isRefetching || overrides.isRefetching,
      dataUpdatedAt: Math.min(
        products.dataUpdatedAt,
        categories.dataUpdatedAt,
        overrides.dataUpdatedAt
      ),
    }),
    [products, categories, overrides, refetch]
  );
}

/** Refetch every catalog read of one tenant (or of every tenant when omitted). */
export async function invalidateMenuCatalog(
  client: QueryClient,
  tenantId?: string | null
): Promise<void> {
  await Promise.all(CATALOG_RESOURCES.map((name) => invalidateResource(client, name, tenantId)));
}

/**
 * The override list with one branch's listing switch turned, as a new array.
 *
 * A branch with no row yet gets one holding the store-wide defaults, which is
 * exactly the row `planBranchListingWrite` would create for it.
 */
export function applyBranchListing(
  overrides: readonly OutletMenuOverrideRow[],
  outletId: string,
  menuItemId: string,
  isListed: boolean
): OutletMenuOverrideRow[] {
  const isTarget = (row: OutletMenuOverrideRow) =>
    row.outlet_id === outletId && row.menu_item_id === menuItemId;

  if (overrides.some(isTarget)) {
    return overrides.map((row) => (isTarget(row) ? { ...row, is_listed: isListed } : row));
  }

  return [
    ...overrides,
    {
      outlet_id: outletId,
      menu_item_id: menuItemId,
      is_listed: isListed,
      is_available: true,
      price: null,
      discounted_price: null,
      discount_cleared: false,
    },
  ];
}

/** The product list with one dish's availability switched, as a new array. */
export function applyProductAvailability(
  products: readonly Product[],
  productId: string,
  isAvailable: boolean
): Product[] {
  return products.map((product) =>
    product.id === productId ? { ...product, is_available: isAvailable } : product
  );
}

export interface MenuCatalogCache {
  /** Refetch the tenant's products, categories and overrides. */
  invalidate: (tenantId: string) => Promise<void>;
  /**
   * Show a listing switch as already turned while the write is in flight.
   * Returns the rollback to call when the write fails.
   */
  patchBranchListing: (
    tenantId: string,
    outletId: string,
    menuItemId: string,
    isListed: boolean
  ) => () => void;
  /**
   * Show a dish as already 86'd (or back on) while the write is in flight.
   * Returns the rollback to call when the write fails.
   */
  patchProductAvailability: (
    tenantId: string,
    productId: string,
    isAvailable: boolean
  ) => () => void;
}

/** The catalog's mutation-side cache handle, for screens that write to the menu. */
export function useMenuCatalogCache(): MenuCatalogCache {
  const client = useQueryClient();

  const invalidate = useCallback(
    (tenantId: string) => invalidateMenuCatalog(client, tenantId),
    [client]
  );

  /** Patch one cached list and hand back the undo, so both patches read alike. */
  const patchList = useCallback(
    <T,>(key: ResourceQueryKey, next: (current: T[]) => T[], fallback: T[]) => {
      const previous = client.getQueryData<T[]>(key);
      client.setQueryData<T[]>(key, (current) => next(current ?? fallback));
      return () => {
        client.setQueryData<T[]>(key, previous);
      };
    },
    [client]
  );

  const patchBranchListing = useCallback(
    (tenantId: string, outletId: string, menuItemId: string, isListed: boolean) =>
      patchList<OutletMenuOverrideRow>(
        resourceKey(BRANCH_MENU_OVERRIDES_RESOURCE, tenantId),
        (current) => applyBranchListing(current, outletId, menuItemId, isListed),
        NO_OVERRIDES
      ),
    [patchList]
  );

  const patchProductAvailability = useCallback(
    (tenantId: string, productId: string, isAvailable: boolean) =>
      patchList<Product>(
        resourceKey(PRODUCTS_RESOURCE, tenantId),
        (current) => applyProductAvailability(current, productId, isAvailable),
        NO_PRODUCTS
      ),
    [patchList]
  );

  return useMemo(
    () => ({ invalidate, patchBranchListing, patchProductAvailability }),
    [invalidate, patchBranchListing, patchProductAvailability]
  );
}
