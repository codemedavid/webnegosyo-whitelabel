/**
 * "Insert into dishes": put one saved add-on group on many dishes at once.
 *
 * Runs on the CALLER's session client (the action checks the `menu` key), so
 * RLS decides every write. A refused UPDATE is zero rows with no error, so each
 * write asks for its row back and a dish that returns none is reported failed.
 *
 * Every dish is read and planned before anything is written: an id that is not
 * this store's aborts the whole request rather than half-applying it.
 */

import { z } from 'zod'
import { applyLibraryGroupToDish, type DishOptionsPatch } from '@/lib/addon-groups/apply-to-dish'
import type { PlaceOutcome } from '@/lib/addon-groups/place-group'
import type { ModifierSource } from '@/lib/modifier-groups'
import type { ModifierGroupLibraryEntry } from '@/types/database'

/** A whole menu fits; beyond this the request is a mistake. */
export const MAX_DISHES_PER_INSERT = 500
/** Ids per read: keeps the `in (...)` filter well inside URL limits. */
const READ_CHUNK = 150
/** Concurrent UPDATEs; every store shares the database. */
const WRITE_CONCURRENCY = 5

export const insertGroupRequestSchema = z.object({
  entryId: z.string().min(1).max(100),
  itemIds: z.array(z.string().min(1).max(100)).min(1, 'Pick at least one dish').max(MAX_DISHES_PER_INSERT),
  onConflict: z.enum(['replace', 'skip']),
})

export type InsertGroupRequest = z.infer<typeof insertGroupRequestSchema>

export interface InsertGroupResult {
  added: number
  replaced: number
  skipped: number
  /** Names of dishes whose write was refused or failed. */
  failed: string[]
  /** Ids of the dishes that now carry the group (added or replaced). */
  updatedIds: string[]
}

interface QueryResult {
  data: unknown
  error: { message?: string } | null
}

/** The slice of a Supabase client this writer uses. */
export interface InsertGroupClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

type DishRow = ModifierSource & { id: string; name: string }

interface PlannedWrite {
  dish: DishRow
  outcome: Exclude<PlaceOutcome, 'skipped'>
  patch: DishOptionsPatch
}

const DISH_SELECT = 'id, name, modifier_groups, variation_types, variations, addons'

function chunk<T>(values: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, index * size + size)
  )
}

async function readEntry(client: InsertGroupClient, tenantId: string, entryId: string): Promise<ModifierGroupLibraryEntry> {
  const { data, error }: QueryResult = await client
    .from('modifier_group_library')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', entryId)
    .maybeSingle()
  if (error) throw new Error(`Could not read the add-on group: ${error.message ?? 'unknown error'}`)
  if (!data) throw new Error('That add-on group was not found in this store.')
  return data as ModifierGroupLibraryEntry
}

async function readDishes(client: InsertGroupClient, tenantId: string, ids: readonly string[]): Promise<DishRow[]> {
  const pages = await Promise.all(
    chunk(ids, READ_CHUNK).map(async (page) => {
      const { data, error }: QueryResult = await client
        .from('menu_items')
        .select(DISH_SELECT)
        .eq('tenant_id', tenantId)
        .in('id', page)
      if (error) throw new Error(`Could not read the dishes: ${error.message ?? 'unknown error'}`)
      return (data ?? []) as DishRow[]
    })
  )
  const dishes = pages.flat()
  const found = new Set(dishes.map((dish) => dish.id))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length > 0) throw new Error(`${missing.length} of the chosen dishes were not found in this store.`)
  return dishes
}

async function writeDish(client: InsertGroupClient, tenantId: string, write: PlannedWrite): Promise<boolean> {
  const { data, error }: QueryResult = await client
    .from('menu_items')
    .update(write.patch)
    .eq('id', write.dish.id)
    .eq('tenant_id', tenantId)
    .select('id')
  if (error) {
    console.error('[addon-groups] Insert into dish failed', { tenantId, menuItemId: write.dish.id, error: error.message })
    return false
  }
  return Array.isArray(data) && data.length > 0
}

export async function insertLibraryGroupIntoDishes(
  client: InsertGroupClient,
  tenantId: string,
  request: InsertGroupRequest,
  makeId: () => string = () => crypto.randomUUID()
): Promise<InsertGroupResult> {
  const { entryId, itemIds, onConflict } = insertGroupRequestSchema.parse(request)
  const ids = [...new Set(itemIds)]

  const entry = await readEntry(client, tenantId, entryId)
  const dishes = await readDishes(client, tenantId, ids)

  const planned = dishes.map((dish) => ({ dish, ...applyLibraryGroupToDish(dish, entry, onConflict, makeId) }))
  const writes = planned.filter((plan): plan is PlannedWrite => plan.patch !== null && plan.outcome !== 'skipped')

  const outcomes: Array<{ write: PlannedWrite; isWritten: boolean }> = []
  for (const batch of chunk(writes, WRITE_CONCURRENCY)) {
    const settled = await Promise.all(batch.map(async (write) => ({ write, isWritten: await writeDish(client, tenantId, write) })))
    outcomes.push(...settled)
  }

  const written = outcomes.filter((o) => o.isWritten)
  return {
    added: written.filter((o) => o.write.outcome === 'added').length,
    replaced: written.filter((o) => o.write.outcome === 'replaced').length,
    skipped: planned.length - writes.length,
    failed: outcomes.filter((o) => !o.isWritten).map((o) => o.write.dish.name),
    updatedIds: written.map((o) => o.write.dish.id),
  }
}
