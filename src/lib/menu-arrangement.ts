/**
 * Menu arrangement writes for the provisioning/MCP path.
 *
 * Ordering is the cheapest lever menu engineering has: a star at the top of its
 * category outsells the same star at the bottom. These writers exist separately
 * from `admin-service.reorderCategories` for two reasons.
 *
 * COMPLETE OR NOTHING. Writing `order` is a wholesale rewrite of the column. A
 * caller that passes half the ids has not reordered those — it has left the
 * omitted rows holding stale positions that now collide with the new ones, and
 * the menu renders interleaved. So the given list must be exactly the set that
 * exists, and a short, padded, or duplicated list is refused before any write.
 *
 * WRITES ARE CHECKED. `reorderCategories` awaits a `Promise.all` of PostgREST
 * query builders and never inspects `error`, so a rejected write returns as a
 * success. Here every result is examined and a failure throws.
 */

import type { ProvisioningCtx } from '@/lib/provisioning/context'

interface IdRow {
  id: string
}

/**
 * Verify `orderedIds` is exactly `existingIds` — same members, no duplicates,
 * nothing missing, nothing foreign. Throws with the specific discrepancy so the
 * calling model can fix its list rather than guess.
 */
function assertCompleteOrdering(
  orderedIds: readonly string[],
  existingIds: readonly string[],
  label: string,
): void {
  if (orderedIds.length === 0) {
    throw new Error(`Refusing to reorder: no ${label} ids were given.`)
  }

  const seen = new Set<string>()
  const duplicates = orderedIds.filter((id) => {
    if (seen.has(id)) return true
    seen.add(id)
    return false
  })
  if (duplicates.length > 0) {
    throw new Error(`Refusing to reorder: duplicate ${label} ids in the ordering (${[...new Set(duplicates)].join(', ')}).`)
  }

  const existing = new Set(existingIds)
  const foreign = orderedIds.filter((id) => !existing.has(id))
  if (foreign.length > 0) {
    throw new Error(
      `Refusing to reorder: ${foreign.join(', ')} ${foreign.length === 1 ? 'does' : 'do'} not belong to this tenant's ${label}.`,
    )
  }

  const missing = existingIds.filter((id) => !seen.has(id))
  if (missing.length > 0) {
    throw new Error(
      `Refusing to reorder: the ordering must list EVERY ${label} — ${missing.length} missing (${missing.join(', ')}). ` +
        'A partial ordering leaves the omitted rows holding stale positions and the menu renders interleaved.',
    )
  }
}

/** Write each id its index, failing loudly if any single update is rejected. */
async function writePositions(
  ctx: ProvisioningCtx,
  table: 'categories' | 'menu_items',
  tenantId: string,
  orderedIds: readonly string[],
): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      ctx.client
        .from(table)
        .update({ order: index } as never)
        .eq('id', id)
        .eq('tenant_id', tenantId),
    ),
  )

  const failure = results.find((r) => r?.error)
  if (failure?.error) {
    throw new Error(`Failed to write the new ${table} order: ${failure.error.message}`)
  }
}

/** Ids currently present for a tenant, optionally narrowed to one category. */
async function existingIds(
  ctx: ProvisioningCtx,
  table: 'categories' | 'menu_items',
  tenantId: string,
  categoryId?: string,
): Promise<string[]> {
  let query = ctx.client.from(table).select('id').eq('tenant_id', tenantId)
  if (categoryId) query = query.eq('category_id', categoryId)

  const { data, error } = await query
  if (error) {
    throw new Error(`Could not read the current ${table} order: ${error.message}`)
  }
  return ((data ?? []) as unknown as IdRow[]).map((r) => r.id)
}

/**
 * Set the display order of a tenant's categories. `categoryIds` must list every
 * category exactly once, top first.
 */
export async function reorderCategoriesForProvisioning(
  tenantId: string,
  categoryIds: readonly string[],
  ctx: ProvisioningCtx,
): Promise<{ reordered: number }> {
  const current = await existingIds(ctx, 'categories', tenantId)
  assertCompleteOrdering(categoryIds, current, 'categories')

  await writePositions(ctx, 'categories', tenantId, categoryIds)
  return { reordered: categoryIds.length }
}

/**
 * Set the display order of the items WITHIN one category. `itemIds` must list
 * every item in that category exactly once, top first.
 */
export async function reorderMenuItemsForProvisioning(
  tenantId: string,
  categoryId: string,
  itemIds: readonly string[],
  ctx: ProvisioningCtx,
): Promise<{ reordered: number }> {
  const current = await existingIds(ctx, 'menu_items', tenantId, categoryId)
  assertCompleteOrdering(itemIds, current, 'items in this category')

  await writePositions(ctx, 'menu_items', tenantId, itemIds)
  return { reordered: itemIds.length }
}
