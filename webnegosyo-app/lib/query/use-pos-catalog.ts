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
import {
  normalizeModifierGroups,
  unfillableRequiredGroup,
  type ModifierGroup,
  type ModifierSource,
} from "../modifier-groups";
import { resourceKey } from "../backends/query-keys";
import { invalidateResource, useResource, type ResourceResult } from "./use-resource";

export const POS_CATALOG_RESOURCE = "pos-catalog";

/** The key segment for the store-wide menu, where no branch is in scope. */
const STORE_WIDE = "store";

/** A product whose modifier groups have already been normalised. */
export interface RegisterItem {
  product: Product;
  groups: ModifierGroup[];
  /**
   * Why the register cannot sell this right now, or null when it can. Set by
   * the merchant's ONE "sold out" switch — the dish's own (`is_available`,
   * branch overrides included) or a required choice with nothing left — never
   * by a stock estimate, which only warns.
   */
  soldOutReason: string | null;
}

export interface PosCatalog {
  /**
   * Every product, in menu order. An 86'd dish stays on the grid as a greyed
   * "Sold out" tile (Toast's behaviour) so the cashier can tell the customer
   * rather than hunt for it — and it cannot be added.
   */
  items: RegisterItem[];
  categories: Category[];
}

export const DISH_SOLD_OUT_REASON =
  "Marked sold out. Turn it back on in Products when you have it again.";

function soldOutReasonFor(product: Product, groups: readonly ModifierGroup[]): string | null {
  if (!product.is_available) return DISH_SOLD_OUT_REASON;
  const group = unfillableRequiredGroup(groups);
  return group ? `Every ${group.name} choice is sold out, so this can't be made right now.` : null;
}

export function buildRegisterItems(products: readonly Product[]): RegisterItem[] {
  return products.map((product) => {
    const groups = normalizeModifierGroups(product as unknown as ModifierSource);
    return { product, groups, soldOutReason: soldOutReasonFor(product, groups) };
  });
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

/** The cache key a register's menu lives on (shared with the offline download). */
export function posCatalogKey(tenantId: string, outletId: string | null) {
  return resourceKey(POS_CATALOG_RESOURCE, tenantId, outletId ?? STORE_WIDE);
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
    tenantId ? posCatalogKey(tenantId, outletId) : null,
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
