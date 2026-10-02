/**
 * Loyverse catalog import: fetches a tenant's Loyverse catalog and writes it
 * into the local menu (categories, menu_items.modifier_groups) plus the
 * loyverse_item_map used later to build receipt lines.
 *
 * Server-only glue around two tested pure modules (client.ts, catalog-mapper.ts).
 * Writes use the service-role client: sync runs from superadmin actions and
 * webhooks where no tenant-admin session exists.
 *
 * Identity lives on menu_items.loyverse_item_id (migration 20260828130000),
 * NOT in the map table. The map is derived data, rebuilt per item as the loop
 * goes; identity has to outlive it, because a sync interrupted mid-loop used
 * to leave dishes created with no map rows — and the next sync then inserted
 * the whole catalog a second time.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveLoyverseConfig } from '@/lib/loyverse/config'
import { loyverseListAll } from '@/lib/loyverse/client'
import type { LoyverseTenant } from '@/lib/loyverse/tenant'
import type { EnsureWebhooksResult } from '@/lib/loyverse/webhooks'
import {
  mapLoyverseCatalog,
  type LoyverseCatalogCategory,
  type LoyverseCatalogInput,
  type LoyverseCatalogItem,
  type LoyverseCatalogMapping,
  type LoyverseCatalogModifier,
  type LoyverseCatalogStockLevel,
  type MappedLoyverseItem,
} from '@/lib/loyverse/catalog-mapper'
import {
  categoriesToCreate,
  createAdopter,
  findRetiredMenuItemIds,
  isMenuItemInSync,
  isVariantMapInSync,
  type ExistingMenuRow,
  type ExistingVariantMapRow,
  type MenuItemSyncFields,
  type UnclaimedRow,
} from '@/lib/loyverse/catalog-import-plan'
import { forEachWithConcurrency } from '@/lib/loyverse/concurrency'
import { shouldMirrorLoyverseImage, mirrorLoyverseImage } from '@/lib/loyverse/image-mirror'

type Db = ReturnType<typeof createAdminClient>

export interface LoyverseSyncReport {
  success: boolean
  error?: string
  categoriesCreated: number
  itemsCreated: number
  /** Dishes matched to an existing local row (written or already in sync). */
  itemsUpdated: number
  /** Of itemsUpdated, how many were already in sync and needed no write. */
  itemsUnchanged?: number
  /** Dishes whose Loyverse item is gone, now marked unavailable. */
  itemsRetired?: number
  itemsSkipped: number
  warnings: string[]
  /** Webhook auto-registration outcome; set by the sync orchestrator, not the import. */
  webhooks?: EnsureWebhooksResult
}

export const emptyReport = (error?: string): LoyverseSyncReport => ({
  success: !error,
  error,
  categoriesCreated: 0,
  itemsCreated: 0,
  itemsUpdated: 0,
  itemsSkipped: 0,
  warnings: [],
})

export interface LoyverseMapRowInsert {
  tenant_id: string
  kind: 'variant' | 'modifier_option'
  menu_item_id: string | null
  local_key: string
  loyverse_item_id: string | null
  loyverse_variant_id: string | null
  loyverse_modifier_id: string | null
  loyverse_modifier_option_id: string | null
  loyverse_sku: string | null
  in_stock?: number | null
}

/**
 * Pure: flattens mapped items' rows into insert payloads. Variant rows get the
 * imported menu_item_id (dropped when the item failed to import); shared
 * modifier-option rows are deduped across items.
 */
export function buildMapRowInserts(
  tenantId: string,
  items: MappedLoyverseItem[],
  menuItemIdByLoyverseId: Record<string, string>
): LoyverseMapRowInsert[] {
  const rows: LoyverseMapRowInsert[] = []
  const seenModifierOptions = new Set<string>()

  for (const item of items) {
    const menuItemId = menuItemIdByLoyverseId[item.loyverseItemId]
    for (const row of item.mapRows) {
      if (row.kind === 'variant') {
        if (!menuItemId) continue
        rows.push({ tenant_id: tenantId, menu_item_id: menuItemId, ...row })
      } else {
        const key = row.loyverse_modifier_option_id ?? row.local_key
        if (seenModifierOptions.has(key)) continue
        seenModifierOptions.add(key)
        rows.push({ tenant_id: tenantId, menu_item_id: null, ...row })
      }
    }
  }
  return rows
}

/**
 * Mirrors per run are capped so image re-hosting can never starve the import
 * of its timeout budget again. A stored Loyverse hotlink still reads as
 * "mirror me" (see image-mirror.ts), so the 6-hourly reconcile finishes the
 * remainder a batch at a time.
 */
export const DEFAULT_IMAGE_MIRROR_LIMIT = 25

/**
 * Dish writes (and image mirrors) run a few at a time: sequential round trips
 * are what let a large catalog outrun the function timeout; unbounded
 * parallelism would swamp the connection pool.
 */
const WRITE_CONCURRENCY = 4

/** Every catalog item lands on the menu; "no category" means this one, never a skip. */
const FALLBACK_CATEGORY_NAME = 'Menu'

const MENU_ROW_COLUMNS =
  'id, loyverse_item_id, name, description, price, category_id, modifier_groups, is_available, image_url'

export interface ImportLoyverseCatalogOptions {
  imageMirrorLimit?: number
}

async function fetchCatalog(accessToken: string, storeId: string): Promise<LoyverseCatalogInput> {
  const [categories, items, modifiers, inventoryLevels] = await Promise.all([
    loyverseListAll<LoyverseCatalogCategory>(accessToken, '/categories', 'categories'),
    loyverseListAll<LoyverseCatalogItem>(accessToken, '/items', 'items'),
    loyverseListAll<LoyverseCatalogModifier>(accessToken, '/modifiers', 'modifiers'),
    // Levels feed initial availability (and the remembered stock on the map)
    // so a dish that is already dry never shows orderable while waiting for
    // its first webhook.
    loyverseListAll<LoyverseCatalogStockLevel>(accessToken, '/inventory', 'inventory_levels', {
      query: { store_ids: storeId },
    }),
  ])
  return { storeId, categories, items, modifiers, inventoryLevels }
}

interface LocalState {
  /** Dishes that already carry a Loyverse identity. */
  identified: ExistingMenuRow[]
  unclaimed: UnclaimedRow[]
  /** Stored variant map rows, by Loyverse item id. */
  variantMapByItem: Map<string, ExistingVariantMapRow[]>
}

/**
 * Identity is read from menu_items.loyverse_item_id, NOT from the map table:
 * the map is derived data, and an interrupted sync that leaves it unwritten
 * must not make the next sync duplicate the catalog (migration 20260828130000).
 * Unclaimed dishes are read too — a tenant whose sync never completed has
 * nothing claimed, and adopting by name is what stops a re-insert.
 */
async function readLocalState(db: Db, tenantId: string): Promise<LocalState> {
  const [identified, unclaimed, variantMap] = await Promise.all([
    db.from('menu_items').select(MENU_ROW_COLUMNS).eq('tenant_id', tenantId).not('loyverse_item_id', 'is', null),
    db.from('menu_items').select('id, name, category_id, image_url').eq('tenant_id', tenantId).is('loyverse_item_id', null),
    db
      .from('loyverse_item_map')
      .select('menu_item_id, loyverse_item_id, loyverse_variant_id, local_key, loyverse_sku, in_stock')
      .eq('tenant_id', tenantId)
      .eq('kind', 'variant'),
  ])
  if (identified.error) throw new Error(`Failed to read menu items: ${identified.error.message}`)
  if (unclaimed.error) throw new Error(`Failed to read menu items: ${unclaimed.error.message}`)
  if (variantMap.error) throw new Error(`Failed to read the Loyverse item map: ${variantMap.error.message}`)

  const variantMapByItem = new Map<string, ExistingVariantMapRow[]>()
  for (const row of (variantMap.data ?? []) as ExistingVariantMapRow[]) {
    if (!row.loyverse_item_id) continue
    const list = variantMapByItem.get(row.loyverse_item_id)
    if (list) list.push(row)
    else variantMapByItem.set(row.loyverse_item_id, [row])
  }
  return {
    identified: ((identified.data ?? []) as unknown as ExistingMenuRow[]).filter((row) => row.id),
    unclaimed: (unclaimed.data ?? []) as unknown as UnclaimedRow[],
    variantMapByItem,
  }
}

async function insertCategories(
  db: Db,
  tenantId: string,
  names: string[],
  firstOrder: number
): Promise<{ created: Array<{ id: string; name: string }>; failures: string[] }> {
  if (names.length === 0) return { created: [], failures: [] }
  const rows = names.map((name, index) => ({ tenant_id: tenantId, name, is_active: true, order: firstOrder + index }))
  const { data, error } = await db.from('categories').insert(rows).select('id, name')
  if (!error && data) return { created: data as Array<{ id: string; name: string }>, failures: [] }

  // One bad name must not cost every category: retry one at a time.
  const created: Array<{ id: string; name: string }> = []
  const failures: string[] = []
  for (const row of rows) {
    const single = await db.from('categories').insert(row).select('id, name').single()
    if (single.error || !single.data) {
      failures.push(`Failed to create category "${row.name}": ${single.error?.message ?? 'unknown'}`)
    } else {
      created.push(single.data as { id: string; name: string })
    }
  }
  return { created, failures }
}

/** Creates the missing categories up front and returns a name → id resolver. */
async function prepareCategories(
  db: Db,
  tenantId: string,
  mapping: LoyverseCatalogMapping,
  report: LoyverseSyncReport
): Promise<(item: MappedLoyverseItem) => string | null> {
  const { data: existing, error } = await db.from('categories').select('id, name').eq('tenant_id', tenantId)
  if (error) throw new Error(`Failed to read categories: ${error.message}`)

  const idByName = new Map<string, string>()
  for (const category of (existing ?? []) as Array<{ id: string; name: string }>) {
    idByName.set(category.name.toLowerCase(), category.id)
  }
  const nameOf = (item: MappedLoyverseItem): string | undefined =>
    item.categoryLoyverseId ? mapping.categoryNames[item.categoryLoyverseId] : undefined

  // Every named category is either existing or about to be created, so only
  // items with no (live) category need the fallback bucket.
  const names = categoriesToCreate(mapping.items, mapping.categoryNames, new Set(idByName.keys()))
  const fallbackKey = FALLBACK_CATEGORY_NAME.toLowerCase()
  const needsFallback = mapping.items.some((item) => !nameOf(item))
  const fallbackPlanned = idByName.has(fallbackKey) || names.some((name) => name.toLowerCase() === fallbackKey)
  if (needsFallback && !fallbackPlanned) names.push(FALLBACK_CATEGORY_NAME)

  const { created, failures } = await insertCategories(db, tenantId, names, idByName.size)
  for (const category of created) idByName.set(category.name.toLowerCase(), category.id)
  report.categoriesCreated += created.length
  report.warnings.push(...failures)

  return (item) => {
    const name = nameOf(item)
    return (name ? idByName.get(name.toLowerCase()) : undefined) ?? idByName.get(fallbackKey) ?? null
  }
}

interface PlannedItem {
  item: MappedLoyverseItem
  categoryId: string
  /** The local row this item writes over; null = insert a new dish. */
  existing: ExistingMenuRow | null
  /** Matched by name, so its identity must be stamped even if nothing else changed. */
  adopted: boolean
}

interface ImportContext {
  db: Db
  tenantId: string
  report: LoyverseSyncReport
  variantMapByItem: Map<string, ExistingVariantMapRow[]>
  menuItemIdByLoyverseId: Record<string, string>
  pendingMirrors: Array<{ menuItemId: string; itemName: string; imageUrl: string }>
}

/** Writes (or skips) one dish; returns its local id, or null when it failed. */
async function upsertMenuItem(ctx: ImportContext, planned: PlannedItem): Promise<string | null> {
  const { db, tenantId, report } = ctx
  const { item, categoryId, existing } = planned

  // Images are NOT mirrored here: the item is written with the Loyverse
  // hotlink (renderable via next.config remotePatterns) and queued for a
  // capped mirror pass after the whole catalog has landed.
  const wantsMirror = shouldMirrorLoyverseImage(existing?.image_url ?? '', item.imageUrl)
  const fields: MenuItemSyncFields = {
    name: item.name,
    description: item.description,
    price: item.price,
    category_id: categoryId,
    modifier_groups: item.modifierGroups,
    is_available: item.isAvailable,
    ...(wantsMirror ? { image_url: item.imageUrl as string } : {}),
  }

  let menuItemId: string
  if (existing && !planned.adopted && isMenuItemInSync(existing, fields)) {
    menuItemId = existing.id
    report.itemsUpdated++
    report.itemsUnchanged = (report.itemsUnchanged ?? 0) + 1
  } else if (existing) {
    const { error } = await db
      .from('menu_items')
      // Stamps identity onto a dish adopted by name; a no-op re-write otherwise.
      // `as never`: ModifierGroup[] is not structurally the generated Json type.
      .update({ ...fields, loyverse_item_id: item.loyverseItemId } as never)
      .eq('id', existing.id)
      .eq('tenant_id', tenantId)
    if (error) {
      report.warnings.push(`Failed to update "${item.name}": ${error.message}`)
      report.itemsSkipped++
      return null
    }
    menuItemId = existing.id
    report.itemsUpdated++
  } else {
    const { data, error } = await db
      .from('menu_items')
      .insert({
        tenant_id: tenantId,
        image_url: '',
        ...fields,
        // The match key, written in the same statement that creates the dish
        // — so an interrupted sync leaves nothing unmatchable.
        loyverse_item_id: item.loyverseItemId,
        variations: [],
        addons: [],
        order: 0,
      } as never)
      .select('id')
      .single()
    if (error || !data) {
      report.warnings.push(`Failed to create "${item.name}": ${error?.message ?? 'unknown'}`)
      report.itemsSkipped++
      return null
    }
    menuItemId = (data as { id: string }).id
    report.itemsCreated++
  }

  ctx.menuItemIdByLoyverseId[item.loyverseItemId] = menuItemId
  if (wantsMirror) {
    ctx.pendingMirrors.push({ menuItemId, itemName: item.name, imageUrl: item.imageUrl as string })
  }
  return menuItemId
}

/**
 * The item's own variant rows, written right after the dish rather than after
 * the whole catalog, so an interrupted sync leaves a partial-but-correct map.
 * Rows already in sync are left alone — which also keeps their remembered
 * stock instead of wiping it on every re-sync.
 */
async function syncItemVariantMap(ctx: ImportContext, item: MappedLoyverseItem): Promise<void> {
  const { db, tenantId, report } = ctx
  const desired = buildMapRowInserts(tenantId, [item], ctx.menuItemIdByLoyverseId).filter(
    (row) => row.kind === 'variant'
  )
  const existing = ctx.variantMapByItem.get(item.loyverseItemId) ?? []
  if (isVariantMapInSync(existing, desired)) return

  const { error: clearError } = await db
    .from('loyverse_item_map')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('kind', 'variant')
    .eq('loyverse_item_id', item.loyverseItemId)
  if (clearError) {
    report.warnings.push(`Failed to clear item map for "${item.name}": ${clearError.message}`)
    return
  }
  if (desired.length === 0) return
  const { error: insertError } = await db.from('loyverse_item_map').insert(desired)
  if (insertError) {
    report.warnings.push(`Failed to write item map for "${item.name}": ${insertError.message}`)
  }
}

/**
 * Shared modifier-option rows are tenant-wide, so they are rebuilt once at the
 * end. Losing them mid-run costs only modifier resolution on receipts, which
 * the next sync repairs.
 */
async function syncModifierMap(ctx: ImportContext, items: MappedLoyverseItem[]): Promise<void> {
  const { db, tenantId, report } = ctx
  const rows = buildMapRowInserts(tenantId, items, ctx.menuItemIdByLoyverseId).filter(
    (row) => row.kind === 'modifier_option'
  )
  const { error: deleteError } = await db
    .from('loyverse_item_map')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('kind', 'modifier_option')
  if (deleteError) {
    report.warnings.push(`Failed to clear modifier map: ${deleteError.message}`)
    return
  }
  if (rows.length === 0) return
  const { error: insertError } = await db.from('loyverse_item_map').insert(rows)
  if (insertError) report.warnings.push(`Failed to write modifier map: ${insertError.message}`)
}

/** Marks dishes whose Loyverse item is gone unavailable, and drops their variant rows. */
async function retireRemovedItems(
  ctx: ImportContext,
  identified: readonly ExistingMenuRow[],
  mapping: LoyverseCatalogMapping
): Promise<void> {
  const { db, tenantId, report } = ctx
  const live = new Set(mapping.items.map((item) => item.loyverseItemId))
  const identity = identified.map((row) => ({ id: row.id, loyverse_item_id: row.loyverse_item_id ?? null }))
  const retiredIds = findRetiredMenuItemIds(identity, live)
  if (retiredIds.length === 0) return

  const retired = new Set(retiredIds)
  const toDisable = identified.filter((row) => retired.has(row.id) && row.is_available !== false)
  if (toDisable.length > 0) {
    const { error } = await db
      .from('menu_items')
      .update({ is_available: false })
      .eq('tenant_id', tenantId)
      .in('id', toDisable.map((row) => row.id))
    if (error) {
      report.warnings.push(`Failed to retire dishes removed from Loyverse: ${error.message}`)
    } else {
      report.itemsRetired = toDisable.length
      report.warnings.push(
        `${toDisable.length} dish(es) no longer in Loyverse were marked unavailable: ${toDisable.map((row) => row.name ?? row.id).join(', ')}`
      )
    }
  }

  // Stale variant rows would keep feeding the stock check and receipt lines
  // with variants Loyverse no longer has.
  const { error: mapError } = await db
    .from('loyverse_item_map')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('kind', 'variant')
    .in('menu_item_id', retiredIds)
  if (mapError) report.warnings.push(`Failed to clear map rows of retired dishes: ${mapError.message}`)
}

/**
 * Capped mirror pass: cosmetic, after the sync is already complete. Failures
 * and the deferred tail both leave the hotlink in place, which the next
 * sync/reconcile recognizes as still needing a mirror.
 */
async function mirrorPendingImages(ctx: ImportContext, limit: number): Promise<void> {
  const { db, tenantId, report, pendingMirrors } = ctx
  const now = pendingMirrors.slice(0, limit)
  await forEachWithConcurrency(now, WRITE_CONCURRENCY, async (pending) => {
    const mirrored = await mirrorLoyverseImage(tenantId, pending.imageUrl)
    if (!mirrored) {
      report.warnings.push(`Image for "${pending.itemName}" could not be re-hosted; using the Loyverse link`)
      return
    }
    const { error } = await db
      .from('menu_items')
      .update({ image_url: mirrored })
      .eq('id', pending.menuItemId)
      .eq('tenant_id', tenantId)
    if (error) {
      report.warnings.push(`Failed to save mirrored image for "${pending.itemName}": ${error.message}`)
    }
  })
  if (pendingMirrors.length > now.length) {
    report.warnings.push(`${pendingMirrors.length - now.length} images deferred to the next sync`)
  }
}

/**
 * Pairs every mapped item with its category and the local row it lands on.
 * Sequential and pure-ish on purpose: adoption hands each unclaimed dish out
 * at most once, which must not race.
 */
function planItems(
  mapping: LoyverseCatalogMapping,
  resolveCategoryId: (item: MappedLoyverseItem) => string | null,
  state: LocalState,
  report: LoyverseSyncReport
): PlannedItem[] {
  const byLoyverseId = new Map(state.identified.map((row) => [row.loyverse_item_id as string, row]))
  const adopt = createAdopter(state.unclaimed)
  const planned: PlannedItem[] = []
  for (const item of mapping.items) {
    const categoryId = resolveCategoryId(item)
    if (!categoryId) {
      report.warnings.push(`Skipped "${item.name}": no category available`)
      report.itemsSkipped++
      continue
    }
    const identified = byLoyverseId.get(item.loyverseItemId) ?? null
    const adopted = identified ? null : adopt(item.name, categoryId)
    planned.push({ item, categoryId, existing: identified ?? adopted, adopted: Boolean(adopted) })
  }
  return planned
}

export async function importLoyverseCatalog(
  tenant: LoyverseTenant,
  options: ImportLoyverseCatalogOptions = {}
): Promise<LoyverseSyncReport> {
  const resolved = resolveLoyverseConfig(tenant)
  if (resolved.status === 'disabled') return emptyReport('Loyverse is not enabled for this tenant')
  if (resolved.status === 'incomplete') {
    return emptyReport(`Loyverse configuration incomplete: missing ${resolved.missing.join(', ')}`)
  }
  const { accessToken, storeId } = resolved.config

  let mapping: LoyverseCatalogMapping
  try {
    mapping = mapLoyverseCatalog(await fetchCatalog(accessToken, storeId))
  } catch (error: unknown) {
    return emptyReport(error instanceof Error ? error.message : 'Failed to fetch the Loyverse catalog')
  }

  const report: LoyverseSyncReport = {
    ...emptyReport(),
    itemsSkipped: mapping.warnings.length,
    warnings: [...mapping.warnings],
  }
  const db = createAdminClient()

  let resolveCategoryId: (item: MappedLoyverseItem) => string | null
  let state: LocalState
  try {
    ;[resolveCategoryId, state] = await Promise.all([
      prepareCategories(db, tenant.id, mapping, report),
      readLocalState(db, tenant.id),
    ])
  } catch (error: unknown) {
    return emptyReport(error instanceof Error ? error.message : 'Failed to read the local menu')
  }

  const ctx: ImportContext = {
    db,
    tenantId: tenant.id,
    report,
    variantMapByItem: state.variantMapByItem,
    menuItemIdByLoyverseId: {},
    pendingMirrors: [],
  }

  const planned = planItems(mapping, resolveCategoryId, state, report)
  await forEachWithConcurrency(planned, WRITE_CONCURRENCY, async (entry) => {
    const menuItemId = await upsertMenuItem(ctx, entry)
    if (menuItemId) await syncItemVariantMap(ctx, entry.item)
  })

  await syncModifierMap(ctx, mapping.items)
  await retireRemovedItems(ctx, state.identified, mapping)

  // The catalog is fully landed; the sync is complete regardless of images.
  const { error: stampError } = await db
    .from('tenants')
    .update({ loyverse_last_synced_at: new Date().toISOString() } as never)
    .eq('id', tenant.id)
  if (stampError) report.warnings.push(`Failed to record the sync time: ${stampError.message}`)

  await mirrorPendingImages(ctx, options.imageMirrorLimit ?? DEFAULT_IMAGE_MIRROR_LIMIT)

  report.success = true
  return report
}
