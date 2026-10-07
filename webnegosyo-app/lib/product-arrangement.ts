/**
 * Arranging products within one category.
 *
 * `menu_items.order` is what the storefront AND this app's register sort by,
 * so one arrangement drives both. Mirrors the web's
 * `src/lib/menu-item-arrangement.ts` — change both together.
 *
 * Live stores carry many tied positions (thousands of dishes at 0), and a tie
 * sorts however the database feels like. Every arrangement therefore renumbers
 * the whole category 0..n, which is what makes the order total.
 */

import { supabase } from "./supabase";
import type { MoveDirection } from "./categories";

export interface ProductPosition {
  id: string;
  order: number;
}

export type ArrangementPlan =
  | { ok: true; writes: ProductPosition[] }
  | { ok: false; error: string };

export const STALE_ARRANGEMENT_ERROR =
  "Your menu changed since this screen loaded. Pull down to refresh and try again.";

const UNSAVED_ERROR = "Could not save the new order. Please try again.";

/** Move one id a place up or down. Pure: the caller's list is left untouched. */
export function moveId(ids: readonly string[], id: string, direction: MoveDirection): string[] {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= ids.length) return [...ids];

  const moved = [...ids];
  moved[from] = ids[to];
  moved[to] = ids[from];
  return moved;
}

/**
 * The writes that put `requestedIds` in order, or a refusal when they are not
 * exactly the category's products — a product added on the web since this
 * screen loaded would otherwise end up sharing a position.
 */
export function planProductArrangement(
  current: readonly ProductPosition[],
  requestedIds: readonly string[],
): ArrangementPlan {
  const currentOrder = new Map(current.map((product) => [product.id, product.order]));
  const isExactPermutation =
    requestedIds.length === current.length &&
    new Set(requestedIds).size === requestedIds.length &&
    requestedIds.every((id) => currentOrder.has(id));

  if (!isExactPermutation) return { ok: false, error: STALE_ARRANGEMENT_ERROR };

  const writes = requestedIds
    .map((id, order) => ({ id, order }))
    .filter(({ id, order }) => currentOrder.get(id) !== order);

  return { ok: true, writes };
}

/**
 * Put one category's products in the given order.
 *
 * The category is re-read rather than trusting the screen's copy. Each write
 * must report the row it changed: an RLS refusal is zero rows with no error.
 */
export async function reorderProducts(
  tenantId: string,
  categoryId: string,
  orderedIds: readonly string[],
): Promise<void> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, order")
    .eq("tenant_id", tenantId)
    .eq("category_id", categoryId);

  if (error) throw error;

  const plan = planProductArrangement((data ?? []) as unknown as ProductPosition[], orderedIds);
  if (!plan.ok) throw new Error(plan.error);

  const results = await Promise.all(
    plan.writes.map(({ id, order }) =>
      supabase
        .from("menu_items")
        .update({ order })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("category_id", categoryId)
        .select("id"),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
  if (results.some((result) => ((result.data as unknown[] | null) ?? []).length === 0)) {
    throw new Error(UNSAVED_ERROR);
  }
}

/** The position a product takes when it joins a category: after everything there. */
export async function nextProductOrder(tenantId: string, categoryId: string): Promise<number> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("order")
    .eq("tenant_id", tenantId)
    .eq("category_id", categoryId)
    .order("order", { ascending: false })
    .limit(1);

  if (error) throw error;
  const highest = ((data ?? []) as { order: number }[])[0]?.order;
  return highest === undefined ? 0 : highest + 1;
}

/**
 * An edited product keeps its position — unless it moved to another category,
 * where its old number means nothing and it joins the end instead. Undefined
 * means "leave `order` alone".
 */
export async function readMovedProductOrder(
  tenantId: string,
  productId: string,
  categoryId: string,
): Promise<number | undefined> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("category_id")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  const current = data as { category_id: string | null } | null;
  if (!current || current.category_id === categoryId) return undefined;
  return nextProductOrder(tenantId, categoryId);
}
