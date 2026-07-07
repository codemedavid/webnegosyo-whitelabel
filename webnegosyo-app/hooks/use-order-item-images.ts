import { useEffect, useState } from "react";
import { fetchProductImages } from "../lib/order-item-images";

// Process-wide cache so thumbnails resolved on one screen (e.g. order detail)
// are instantly available on another (e.g. the orders list) without refetching.
// `fetchedIds` records every id we've *attempted*, so ids with no image don't
// trigger a refetch on every render.
const imageCache = new Map<string, string>();
const fetchedIds = new Set<string>();

interface OrderItemImages {
  images: Map<string, string>;
  isLoading: boolean;
}

/**
 * Resolves product image urls for a set of Convex `menuItemId`s. Fetching is
 * best-effort: failures leave the map empty and callers fall back to initials.
 */
export function useOrderItemImages(menuItemIds: string[]): OrderItemImages {
  const ids = Array.from(new Set(menuItemIds.filter(Boolean)));
  const key = ids.slice().sort().join(",");
  const [, setTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const missing = ids.filter((id) => !fetchedIds.has(id));
    if (missing.length === 0) return;

    let active = true;
    setIsLoading(true);
    fetchProductImages(missing)
      .then((map) => {
        map.forEach((url, id) => imageCache.set(id, url));
      })
      .catch(() => {
        // Images are a non-critical enhancement — swallow so the UI never
        // crashes, but record the attempt below to avoid a refetch loop.
      })
      .finally(() => {
        missing.forEach((id) => fetchedIds.add(id));
        if (active) {
          setIsLoading(false);
          setTick((n) => n + 1);
        }
      });

    return () => {
      active = false;
    };
    // `key` captures the full id set; re-run only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const images = new Map<string, string>();
  for (const id of ids) {
    const url = imageCache.get(id);
    if (url) images.set(id, url);
  }

  return { images, isLoading };
}
