/**
 * The inventory screen's three reads, named for the cache.
 *
 * A movement, a transfer step or a count can each re-level the shelf — a
 * receipt credits one branch and can post a shortfall against another, and
 * either can cross a reorder line and 86 a dish. So every write invalidates
 * ALL THREE, and a screen that used to refresh only the read it touched now
 * shows the shelf the store actually has.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";
import { resourceKey, type ResourceQueryKey } from "../backends/query-keys";
import { invalidateResources, setResourceData } from "./resource-cache";
import type { OpenCountSession } from "../count-session-service";

export const INVENTORY_SHELF_RESOURCE = "inventory-shelf";
export const INVENTORY_COUNT_RESOURCE = "inventory-count";
export const INVENTORY_TRANSFERS_RESOURCE = "inventory-transfers";

const INVENTORY_RESOURCES = [
  INVENTORY_SHELF_RESOURCE,
  INVENTORY_COUNT_RESOURCE,
  INVENTORY_TRANSFERS_RESOURCE,
] as const;

/** Key segments: an unscoped shelf and the unbranched pool are different shelves. */
const WHOLE_STORE = "store";
const STORE_POOL = "pool";

/** `undefined` is the whole store (the roll-up); a branch id is that shelf. */
export function inventoryShelfKey(tenantId: string, outletId: string | undefined): ResourceQueryKey {
  return resourceKey(INVENTORY_SHELF_RESOURCE, tenantId, outletId ?? WHOLE_STORE);
}

/** `null` is the store pool, a real shelf — see `loadOpenCount`. */
export function inventoryCountKey(tenantId: string, outletId: string | null): ResourceQueryKey {
  return resourceKey(INVENTORY_COUNT_RESOURCE, tenantId, outletId ?? STORE_POOL);
}

export function inventoryTransfersKey(tenantId: string): ResourceQueryKey {
  return resourceKey(INVENTORY_TRANSFERS_RESOURCE, tenantId);
}

export function invalidateInventory(client: QueryClient, tenantId: string): Promise<void> {
  return invalidateResources(client, INVENTORY_RESOURCES, tenantId);
}

export interface InventoryCache {
  /** After any write that can move stock. */
  invalidateAll: () => Promise<void>;
  /** After a cancelled draft: nothing moved, only the list changed. */
  invalidateTransfers: () => Promise<void>;
  /** The count just opened or closed, known without a round trip. */
  setCount: (outletId: string | null, count: OpenCountSession | null) => void;
}

export function useInventoryCache(tenantId: string | null): InventoryCache {
  const client = useQueryClient();

  const invalidateAll = useCallback(async () => {
    if (!tenantId) return;
    await invalidateInventory(client, tenantId);
  }, [client, tenantId]);

  const invalidateTransfers = useCallback(async () => {
    if (!tenantId) return;
    await invalidateResources(client, [INVENTORY_TRANSFERS_RESOURCE], tenantId);
  }, [client, tenantId]);

  const setCount = useCallback(
    (outletId: string | null, count: OpenCountSession | null) => {
      if (!tenantId) return;
      setResourceData<OpenCountSession | null>(client, inventoryCountKey(tenantId, outletId), () => count);
    },
    [client, tenantId]
  );

  return useMemo(
    () => ({ invalidateAll, invalidateTransfers, setCount }),
    [invalidateAll, invalidateTransfers, setCount]
  );
}
