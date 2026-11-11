/**
 * What things cost, read through the `costs`-gated functions
 * (migration 20261107130000) now that `unit_cost` is not selectable on
 * `inventory_items` / `stock_movements`.
 *
 * Call these only after the existing `costs` gate of the screen or action: the
 * database answers 42501 to a caller without the key, and every reader here
 * turns exactly that into `null` ("you may not know"), never into zero. Any
 * other failure throws, so a transport error can never read as a free
 * ingredient.
 */

import type { InventoryItem, StockMovement } from '@/types/database'

/** Anything with an `rpc` — the cookie-bound server client or a Bearer client. */
export interface CostReaderClient {
  rpc: (fn: never, args?: never) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>
}

const PAGE_SIZE = 1000
const MOVEMENT_CHUNK = 1000
const NOT_ALLOWED = '42501'

interface ItemCostRow {
  inventory_item_id: string
  unit_cost: number | string | null
}

interface MovementCostRow {
  movement_id: string
  unit_cost: number | string | null
}

async function call<T>(client: CostReaderClient, fn: string, args: Record<string, unknown>): Promise<T[] | null> {
  const { data, error } = await client.rpc(fn as never, args as never)
  if (error) {
    if (error.code === NOT_ALLOWED) return null
    throw error
  }
  return Array.isArray(data) ? (data as T[]) : []
}

/**
 * Ingredient costs by id, or `null` when the caller does not hold `costs`.
 * `itemIds` omitted = the whole store (paged past the 1000-row API cap).
 */
export async function readItemCosts(
  client: CostReaderClient,
  tenantId: string,
  itemIds?: readonly string[],
): Promise<Map<string, number> | null> {
  const costs = new Map<string, number>()
  let after: string | null = null
  for (;;) {
    const page: ItemCostRow[] | null = await call<ItemCostRow>(client, 'inventory_costs_for_tenant', {
      p_tenant_id: tenantId,
      p_item_ids: itemIds ? [...itemIds] : null,
      p_after: after,
    })
    if (page === null) return null
    for (const row of page) costs.set(row.inventory_item_id, Number(row.unit_cost ?? 0))
    if (page.length < PAGE_SIZE) return costs
    after = page[page.length - 1].inventory_item_id
  }
}

/** Movement costs by movement id (NULL = not recorded), or `null` without `costs`. */
export async function readMovementCosts(
  client: CostReaderClient,
  tenantId: string,
  movementIds: readonly string[],
): Promise<Map<string, number> | null> {
  const costs = new Map<string, number>()
  for (let start = 0; start < movementIds.length; start += MOVEMENT_CHUNK) {
    const page = await call<MovementCostRow>(client, 'inventory_movement_costs', {
      p_tenant_id: tenantId,
      p_movement_ids: movementIds.slice(start, start + MOVEMENT_CHUNK),
    })
    if (page === null) return null
    for (const row of page) {
      if (row.unit_cost !== null) costs.set(row.movement_id, Number(row.unit_cost))
    }
  }
  return costs
}

type WithoutCost<T> = Omit<T, 'unit_cost'>

/**
 * The rows with their price filled in. A caller without `costs` gets 0, the
 * value every non-costs screen already ignores (`ingredientsForCaller` strips
 * it for them); a caller with `costs` gets the stored figure.
 */
export async function withItemCosts<T extends WithoutCost<InventoryItem>>(
  client: CostReaderClient,
  tenantId: string,
  rows: readonly T[],
): Promise<Array<T & { unit_cost: number }>> {
  if (rows.length === 0) return []
  const costs = await readItemCosts(client, tenantId, rows.length <= 200 ? rows.map((row) => row.id) : undefined)
  return rows.map((row) => ({ ...row, unit_cost: costs?.get(row.id) ?? 0 }))
}

/** Movements with their recorded price, left absent (as before) when unknown. */
export async function withMovementCosts<T extends WithoutCost<StockMovement>>(
  client: CostReaderClient,
  tenantId: string,
  rows: readonly T[],
): Promise<Array<T & { unit_cost: number | null }>> {
  const costs = rows.length === 0 ? new Map<string, number>() : await readMovementCosts(client, tenantId, rows.map((row) => row.id))
  return rows.map((row) => ({ ...row, unit_cost: costs?.get(row.id) ?? null }))
}
