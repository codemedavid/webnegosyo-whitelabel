/**
 * Loyverse catalog import: fetches a tenant's Loyverse catalog and writes it
 * into the local menu (categories, menu_items.modifier_groups) plus the
 * loyverse_item_map used later to build receipt lines.
 *
 * Server-only glue around two tested pure modules (client.ts, catalog-mapper.ts).
 * Writes use the service-role client: sync runs from superadmin actions and
 * webhooks where no tenant-admin session exists.
 *
 * The map table is derived data — each sync deletes the tenant's rows and
 * re-inserts, which keeps it exactly in step with the menu JSON it describes.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { Tenant } from '@/types/database'
import { resolveLoyverseConfig } from '@/lib/loyverse/config'
import { loyverseListAll } from '@/lib/loyverse/client'
import {
  mapLoyverseCatalog,
  type LoyverseCatalogCategory,
  type LoyverseCatalogItem,
  type LoyverseCatalogModifier,
  type LoyverseCatalogStockLevel,
  type MappedLoyverseItem,
} from '@/lib/loyverse/catalog-mapper'
import { shouldMirrorLoyverseImage, mirrorLoyverseImage } from '@/lib/loyverse/image-mirror'

export interface LoyverseSyncReport {
  success: boolean
  error?: string
  categoriesCreated: number
  itemsCreated: number
  itemsUpdated: number
  itemsSkipped: number
  warnings: string[]
  /** Webhook auto-registration outcome; set by the sync action, not the import. */
  webhooks?: { registered: number; alreadyActive: number; error?: string }
}

const emptyReport = (error?: string): LoyverseSyncReport => ({
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

interface ExistingCategoryRow {
  id: string
  name: string
}

interface ExistingMapRow {
  menu_item_id: string | null
  loyverse_item_id: string | null
}

export async function importLoyverseCatalog(tenant: Tenant): Promise<LoyverseSyncReport> {
  const resolved = resolveLoyverseConfig(tenant)
  if (resolved.status === 'disabled') return emptyReport('Loyverse is not enabled for this tenant')
  if (resolved.status === 'incomplete') {
    return emptyReport(`Loyverse configuration incomplete: missing ${resolved.missing.join(', ')}`)
  }
  const { accessToken, storeId } = resolved.config

  let categories: LoyverseCatalogCategory[]
  let items: LoyverseCatalogItem[]
  let modifiers: LoyverseCatalogModifier[]
  let inventoryLevels: LoyverseCatalogStockLevel[]
  try {
    ;[categories, items, modifiers, inventoryLevels] = await Promise.all([
      loyverseListAll<LoyverseCatalogCategory>(accessToken, '/categories', 'categories'),
      loyverseListAll<LoyverseCatalogItem>(accessToken, '/items', 'items'),
      loyverseListAll<LoyverseCatalogModifier>(accessToken, '/modifiers', 'modifiers'),
      // Levels feed initial availability so a dish that is already dry in
      // Loyverse never shows orderable while waiting for its first webhook.
      loyverseListAll<LoyverseCatalogStockLevel>(accessToken, '/inventory', 'inventory_levels', {
        query: { store_ids: storeId },
      }),
    ])
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch the Loyverse catalog'
    return emptyReport(message)
  }

  const mapping = mapLoyverseCatalog({ storeId, categories, modifiers, items, inventoryLevels })
  const report: LoyverseSyncReport = {
    ...emptyReport(),
    itemsSkipped: mapping.warnings.length,
    warnings: [...mapping.warnings],
  }

  const supabase = createAdminClient()

  // --- Categories: match by name (case-insensitive), create the missing ones.
  const { data: existingCategories, error: categoriesError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('tenant_id', tenant.id)
  if (categoriesError) return emptyReport(`Failed to read categories: ${categoriesError.message}`)

  const categoryIdByName = new Map<string, string>()
  for (const category of (existingCategories ?? []) as ExistingCategoryRow[]) {
    categoryIdByName.set(category.name.toLowerCase(), category.id)
  }

  const neededCategoryNames = new Set<string>()
  for (const item of mapping.items) {
    const name = item.categoryLoyverseId ? mapping.categoryNames[item.categoryLoyverseId] : null
    if (name && !categoryIdByName.has(name.toLowerCase())) neededCategoryNames.add(name)
  }

  let nextOrder = categoryIdByName.size
  for (const name of neededCategoryNames) {
    const { data: created, error: createError } = await supabase
      .from('categories')
      .insert({ tenant_id: tenant.id, name, is_active: true, order: nextOrder } as never)
      .select('id')
      .single()
    if (createError || !created) {
      report.warnings.push(`Failed to create category "${name}": ${createError?.message ?? 'unknown'}`)
      continue
    }
    categoryIdByName.set(name.toLowerCase(), (created as ExistingCategoryRow).id)
    report.categoriesCreated++
    nextOrder++
  }

  // Fallback bucket for items whose Loyverse category is missing/deleted —
  // every catalog item must land on the menu, so the answer to "no category"
  // is a lazily created "Menu" category, never a skip.
  const FALLBACK_CATEGORY_NAME = 'Menu'
  const ensureFallbackCategoryId = async (): Promise<string | null> => {
    const cached = categoryIdByName.get(FALLBACK_CATEGORY_NAME.toLowerCase())
    if (cached) return cached
    const { data: created, error: createError } = await supabase
      .from('categories')
      .insert({
        tenant_id: tenant.id,
        name: FALLBACK_CATEGORY_NAME,
        is_active: true,
        order: nextOrder,
      } as never)
      .select('id')
      .single()
    if (createError || !created) return null
    nextOrder++
    report.categoriesCreated++
    const id = (created as ExistingCategoryRow).id
    categoryIdByName.set(FALLBACK_CATEGORY_NAME.toLowerCase(), id)
    return id
  }

  const resolveCategoryId = async (item: MappedLoyverseItem): Promise<string | null> => {
    const name = item.categoryLoyverseId ? mapping.categoryNames[item.categoryLoyverseId] : null
    const matched = name ? (categoryIdByName.get(name.toLowerCase()) ?? null) : null
    return matched ?? (await ensureFallbackCategoryId())
  }

  // --- Existing links: loyverse item -> local menu item (from the map table).
  // The generated Supabase types lag new migrations (loyverse_item_map is not
  // in src/types/supabase.ts yet), so these queries go through `any` the same
  // way bulk-menu-import does.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapTable = () => (supabase as any).from('loyverse_item_map')
  const { data: existingMapRows, error: mapReadError } = await mapTable()
    .select('menu_item_id, loyverse_item_id')
    .eq('tenant_id', tenant.id)
    .eq('kind', 'variant')
  if (mapReadError) return emptyReport(`Failed to read item map: ${mapReadError.message}`)

  const menuItemIdByLoyverseId: Record<string, string> = {}
  for (const row of (existingMapRows ?? []) as ExistingMapRow[]) {
    if (row.loyverse_item_id && row.menu_item_id) {
      menuItemIdByLoyverseId[row.loyverse_item_id] = row.menu_item_id
    }
  }

  // Current images for mapped items: the mirror decision needs to know
  // whether the local photo is a merchant upload (kept) or a Loyverse
  // hotlink / nothing (replaced by an ImageKit mirror).
  const existingMenuItemIds = Object.values(menuItemIdByLoyverseId)
  const imageByMenuItemId = new Map<string, string>()
  if (existingMenuItemIds.length > 0) {
    const { data: imageRows } = await supabase
      .from('menu_items')
      .select('id, image_url')
      .eq('tenant_id', tenant.id)
      .in('id', existingMenuItemIds)
    for (const row of (imageRows ?? []) as Array<{ id: string; image_url: string | null }>) {
      imageByMenuItemId.set(row.id, row.image_url ?? '')
    }
  }

  // --- Upsert menu items.
  for (const item of mapping.items) {
    const categoryId = await resolveCategoryId(item)
    if (!categoryId) {
      report.warnings.push(`Skipped "${item.name}": no category available`)
      report.itemsSkipped++
      continue
    }

    const existingId = menuItemIdByLoyverseId[item.loyverseItemId]

    // Re-host the Loyverse photo on ImageKit; fall back to the hotlink (kept
    // renderable via next.config remotePatterns) when the mirror fails. A
    // merchant-hosted image is never touched.
    const currentImage = existingId ? (imageByMenuItemId.get(existingId) ?? '') : ''
    let imageField: { image_url: string } | Record<string, never> = {}
    if (shouldMirrorLoyverseImage(currentImage, item.imageUrl)) {
      const mirrored = await mirrorLoyverseImage(tenant.id, item.imageUrl as string)
      if (!mirrored) {
        report.warnings.push(`Image for "${item.name}" could not be re-hosted; using the Loyverse link`)
      }
      imageField = { image_url: mirrored ?? (item.imageUrl as string) }
    }

    const commonFields = {
      name: item.name,
      description: item.description,
      price: item.price,
      category_id: categoryId,
      modifier_groups: item.modifierGroups,
      is_available: item.isAvailable,
      ...imageField,
    }

    if (existingId) {
      const { error: updateError } = await supabase
        .from('menu_items')
        .update(commonFields as never)
        .eq('id', existingId)
        .eq('tenant_id', tenant.id)
      if (updateError) {
        report.warnings.push(`Failed to update "${item.name}": ${updateError.message}`)
        report.itemsSkipped++
        continue
      }
      report.itemsUpdated++
    } else {
      const { data: created, error: insertError } = await supabase
        .from('menu_items')
        .insert({
          tenant_id: tenant.id,
          image_url: '',
          ...commonFields,
          variations: [],
          addons: [],
          order: 0,
        } as never)
        .select('id')
        .single()
      if (insertError || !created) {
        report.warnings.push(`Failed to create "${item.name}": ${insertError?.message ?? 'unknown'}`)
        report.itemsSkipped++
        continue
      }
      menuItemIdByLoyverseId[item.loyverseItemId] = (created as { id: string }).id
      report.itemsCreated++
    }
  }

  // --- Rebuild the map table for this tenant.
  const mapRows = buildMapRowInserts(tenant.id, mapping.items, menuItemIdByLoyverseId)
  const { error: deleteError } = await mapTable().delete().eq('tenant_id', tenant.id)
  if (deleteError) {
    report.warnings.push(`Failed to clear item map: ${deleteError.message}`)
  } else if (mapRows.length > 0) {
    const { error: insertMapError } = await mapTable().insert(mapRows)
    if (insertMapError) {
      report.warnings.push(`Failed to write item map: ${insertMapError.message}`)
    }
  }

  await supabase
    .from('tenants')
    .update({ loyverse_last_synced_at: new Date().toISOString() } as never)
    .eq('id', tenant.id)

  report.success = true
  return report
}
