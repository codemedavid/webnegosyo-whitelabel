/**
 * Ingredient prices for the merchant app, read through the `costs`-gated
 * function (`inventory_costs_for_tenant`, migration 20261107130000).
 *
 * `inventory_items.unit_cost` is not selectable by the session role once
 * 20261107130100 is applied, so the shelf, ingredient and daily-report reads
 * name their non-cost columns and merge the price in with this. An account
 * without `costs` is answered 42501, which becomes an EMPTY map here: its
 * screens already hide prices, and "unknown" stays undefined rather than 0.
 * Any other failure throws, so a network error never reads as a free ingredient.
 */

import { supabase } from "./supabase";

const PAGE_SIZE = 1000;
const NOT_ALLOWED = "42501";

interface ItemCostRow {
  inventory_item_id: string;
  unit_cost: number | string | null;
}

/** Anything with an `rpc` — the app's session client, or a stand-in under test. */
export interface RpcClient {
  rpc: (fn: never, args?: never) => PromiseLike<{ data: unknown; error: unknown }>;
}

export async function loadItemCosts(
  tenantId: string,
  itemIds?: readonly string[],
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<Map<string, number>> {
  const costs = new Map<string, number>();
  if (!tenantId) return costs;

  let after: string | null = null;
  for (;;) {
    const { data, error } = await client.rpc("inventory_costs_for_tenant" as never, {
      p_tenant_id: tenantId,
      p_item_ids: itemIds ? [...itemIds] : null,
      p_after: after,
    } as never);
    if (error) {
      if ((error as { code?: string }).code === NOT_ALLOWED) return new Map();
      throw error;
    }
    const page = (Array.isArray(data) ? data : []) as unknown as ItemCostRow[];
    for (const row of page) costs.set(row.inventory_item_id, Number(row.unit_cost ?? 0));
    if (page.length < PAGE_SIZE) return costs;
    after = page[page.length - 1].inventory_item_id;
  }
}

/** The rows with `unit_cost` set where the caller may know it, absent elsewhere. */
export function withCosts<T extends { id: string }>(
  rows: readonly T[],
  costs: ReadonlyMap<string, number>,
): Array<T & { unit_cost?: number }> {
  return rows.map((row) => (costs.has(row.id) ? { ...row, unit_cost: costs.get(row.id) as number } : row));
}
