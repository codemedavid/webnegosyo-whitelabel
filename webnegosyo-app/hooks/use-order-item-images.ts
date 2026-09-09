import { useEffect, useMemo, useState } from "react";
import { fetchProductImages } from "../lib/order-item-images";
import { useAuthStore } from "../stores/auth-store";

/**
 * One store's resolved thumbnails, shared by every screen showing its orders
 * (the orders list and an order's detail resolve the same ids). `attempted`
 * records every id looked up — with or without an image — so ids that have
 * no image do not trigger a fetch on every render.
 */
interface TenantImageStore {
  images: Map<string, string>;
  attempted: Set<string>;
}

/**
 * Keyed by tenant: a superadmin switching stores, or the next account on a
 * shared device, gets a fresh lookup rather than the previous store's images
 * served for an id that happens to match.
 */
const storesByTenant = new Map<string, TenantImageStore>();

function storeFor(tenantId: string): TenantImageStore {
  const existing = storesByTenant.get(tenantId);
  if (existing) return existing;
  const created: TenantImageStore = { images: new Map(), attempted: new Set() };
  storesByTenant.set(tenantId, created);
  return created;
}

/** Test seam: forget every store's thumbnails. */
export function resetOrderItemImageCaches(): void {
  storesByTenant.clear();
}

interface OrderItemImages {
  images: Map<string, string>;
  isLoading: boolean;
}

/** The ids as a value: deduplicated, blank-free, sorted — so a fresh array of the same ids is the same key. */
function idsKeyOf(menuItemIds: readonly string[]): string {
  return Array.from(new Set(menuItemIds.filter(Boolean))).sort().join(",");
}

/**
 * Resolves product image urls for a set of `menuItemId`s under the tenant in
 * scope. Fetching is best-effort: failures leave the map empty and callers
 * fall back to initials.
 */
export function useOrderItemImages(menuItemIds: string[]): OrderItemImages {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const idsKey = idsKeyOf(menuItemIds);
  const ids = useMemo(() => (idsKey ? idsKey.split(",") : []), [idsKey]);
  const [resolvedTick, setResolvedTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!tenantId || ids.length === 0) return;
    const store = storeFor(tenantId);
    const missing = ids.filter((id) => !store.attempted.has(id));
    if (missing.length === 0) {
      // A lookup for another store may have been abandoned mid-flight.
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    fetchProductImages(missing)
      .then((map) => {
        map.forEach((url, id) => store.images.set(id, url));
      })
      .catch(() => {
        // Images are a non-critical enhancement — swallow so the UI never
        // crashes, but record the attempt below to avoid a refetch loop.
      })
      .finally(() => {
        missing.forEach((id) => store.attempted.add(id));
        if (!isActive) return;
        setIsLoading(false);
        setResolvedTick((n) => n + 1);
      });

    return () => {
      isActive = false;
    };
  }, [tenantId, ids]);

  const images = useMemo(() => {
    const out = new Map<string, string>();
    const store = tenantId ? storesByTenant.get(tenantId) : undefined;
    if (!store) return out;
    for (const id of ids) {
      const url = store.images.get(id);
      if (url) out.set(id, url);
    }
    return out;
    // `resolvedTick` is the signal that the store gained entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, ids, resolvedTick]);

  return { images, isLoading };
}
