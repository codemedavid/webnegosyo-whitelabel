/**
 * The register's product catalog, on the shared cache.
 *
 * Keyed by tenant AND branch: the register rings up the branch it belongs to,
 * and per-branch pricing means North's menu is not South's. A store-wide
 * account (the owner, a single-shop merchant) reads the store-wide menu on its
 * own key.
 *
 * The modifier groups are normalised in the fetcher, once per read, rather
 * than on every render of the grid.
 */

import { useCallback } from "react";
import type { QueryClient } from "@tanstack/query-core";
import { listCategories, listProducts, type Category, type Product } from "../products";
import { normalizeModifierGroups, type ModifierGroup, type ModifierSource } from "../modifier-groups";
import { resourceKey } from "../backends/query-keys";
import { invalidateResource, useResource, type ResourceResult } from "./use-resource";

export const POS_CATALOG_RESOURCE = "pos-catalog";

/** The key segment for the store-wide menu, where no branch is in scope. */
const STORE_WIDE = "store";

/** A product whose modifier groups have already been normalised. */
export interface RegisterItem {
  product: Product;
  groups: ModifierGroup[];
}

export interface PosCatalog {
  /** Available products only — the register cannot sell what is 86'd. */
  items: RegisterItem[];
  categories: Category[];
}

export function buildRegisterItems(products: readonly Product[]): RegisterItem[] {
  return products
    .filter((product) => product.is_available)
    .map((product) => ({
      product,
      groups: normalizeModifierGroups(product as unknown as ModifierSource),
    }));
}

export async function fetchPosCatalog(
  tenantId: string,
  outletId: string | null
): Promise<PosCatalog> {
  const [products, categories] = await Promise.all([
    listProducts(tenantId, outletId),
    listCategories(tenantId),
  ]);
  return { items: buildRegisterItems(products), categories };
}

export function usePosCatalog(
  tenantId: string | null,
  outletId: string | null
): ResourceResult<PosCatalog> {
  const fetcher = useCallback(
    () => fetchPosCatalog(tenantId as string, outletId),
    [tenantId, outletId]
  );
  return useResource<PosCatalog>(
    tenantId ? resourceKey(POS_CATALOG_RESOURCE, tenantId, outletId ?? STORE_WIDE) : null,
    fetcher,
    // The register must open without a connection: sell from the last menu
    // this device saw. Keyed per branch, so a branch never sells store prices.
    { offlineSnapshot: true }
  );
}

/** Every branch's copy of the tenant's register menu re-reads. */
export function invalidatePosCatalog(client: QueryClient, tenantId: string): Promise<void> {
  return invalidateResource(client, POS_CATALOG_RESOURCE, tenantId);
}
