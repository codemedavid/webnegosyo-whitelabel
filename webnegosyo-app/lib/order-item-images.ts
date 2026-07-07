// Joins order items to their product imagery. Convex `orderItems` only store
// `menuItemId`, so thumbnails are resolved on demand from Supabase `menu_items`
// (the same table `lib/products.ts` reads). Images are a non-critical
// enhancement: any query failure degrades to "no image" rather than blocking
// the order UI, and callers fall back to initials/placeholders.
import { supabase } from "./supabase";

interface MenuItemImageRow {
  id: string;
  image_url: string | null;
}

/**
 * Batch-fetch product image urls for a set of menu item ids.
 * Returns a Map keyed by menuItemId; ids without an image are simply absent.
 */
export async function fetchProductImages(
  menuItemIds: string[]
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(menuItemIds.filter(Boolean)));
  const images = new Map<string, string>();
  if (ids.length === 0) return images;

  const { data, error } = await supabase
    .from("menu_items")
    .select("id, image_url")
    .in("id", ids);

  if (error || !data) return images;

  for (const row of data as MenuItemImageRow[]) {
    if (row.image_url && row.image_url.trim() !== "") {
      images.set(row.id, row.image_url);
    }
  }
  return images;
}
