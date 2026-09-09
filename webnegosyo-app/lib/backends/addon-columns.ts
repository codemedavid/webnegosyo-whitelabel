import type { OrderAddon } from "./supabase-orders";

/**
 * What the platform `order_items.addons` column accepts.
 *
 * On the shared platform database the column is a legacy `text[] NOT NULL
 * DEFAULT '{}'` of addon NAMES — the same shape web checkout writes. Convex
 * stores `{ name, price }` objects, and the register builds its items in that
 * shape, so the objects must be flattened here: PostgREST refuses a JSON
 * object inside a `text[]`, and a `null` violates the NOT NULL. Either way the
 * order row had already landed, so the sale showed up with NO LINE ITEMS.
 *
 * The price is not lost to the bill — each line's `price`/`subtotal` already
 * include the addon — only to the per-addon breakdown, exactly as on web orders.
 */
export function toAddonColumn(addons: readonly OrderAddon[] | undefined | null): string[] {
  if (!Array.isArray(addons)) return [];
  return addons
    .map((addon) => (typeof addon?.name === "string" ? addon.name.trim() : ""))
    .filter((name) => name !== "");
}
