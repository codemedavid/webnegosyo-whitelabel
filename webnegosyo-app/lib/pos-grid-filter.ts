/**
 * Which register tiles show for the chosen category and search.
 *
 * Sold-out dishes are NOT filtered out: an 86'd dish stays on the grid as a
 * greyed "Sold out" tile in every category and search result, so the cashier
 * can tell the customer instead of hunting for a dish that silently vanished.
 */

import { sanitizeSearchQuery } from "./products";

export interface GridItemLike {
  product: { name: string; category_id: string | null | undefined };
}

export function filterRegisterItems<T extends GridItemLike>(
  items: readonly T[],
  activeCategory: string | null,
  search: string,
): T[] {
  const term = sanitizeSearchQuery(search).toLowerCase();
  return items.filter(({ product }) => {
    const inCategory = !activeCategory || product.category_id === activeCategory;
    const matches = !term || product.name.toLowerCase().includes(term);
    return inCategory && matches;
  });
}
