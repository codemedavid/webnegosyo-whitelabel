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
  type MappedLoyverseItem,
} from '@/lib/loyverse/catalog-mapper'

export interface LoyverseSyncReport {
  success: boolean
  error?: string
  categoriesCreated: number
  itemsCreated: number
  itemsUpdated: number
  itemsSkipped: number
  warnings: string[]
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
  try {
    ;[categories, items, modifiers] = await Promise.all([
      loyverseListAll<LoyverseCatalogCategory>(accessToken, '/categories', 'categories'),
      loyverseListAll<LoyverseCatalogItem>(accessToken, '/items', 'items'),
      loyverseListAll<LoyverseCatalogModifier>(accessToken, '/modifiers', 'modifiers'),
    ])
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch the Loyverse catalog'
    return emptyReport(message)
  }

  const mapping = mapLoyverseCatalog({ storeId, categories, modifiers, items })
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

  // Fallback bucket for items whose Loyverse category is missing/deleted.
  const resolveCategoryId = (item: MappedLoyverseItem): string | null => {
    const name = item.categoryLoyverseId ? mapping.categoryNames[item.categoryLoyverseId] : null
    return name ? (categoryIdByName.get(name.toLowerCase()) ?? null) : null
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

  // --- Upsert menu items.
  for (const item of mapping.items) {
    const categoryId = resolveCategoryId(item)
    if (!categoryId) {
      report.warnings.push(`Skipped "${item.name}": no category available`)
      report.itemsSkipped++
      continue
    }

    const existingId = menuItemIdByLoyverseId[item.loyverseItemId]
    const commonFields = {
      name: item.name,
      description: item.description,
      price: item.price,
      category_id: categoryId,
      modifier_groups: item.modifierGroups,
      is_available: item.isAvailable,
      // Only overwrite the image when Loyverse has one — a merchant may have
      // uploaded a nicer local photo for an item Loyverse never got one for.
      ...(item.imageUrl ? { image_url: item.imageUrl } : {}),
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
          ...commonFields,
          image_url: item.imageUrl ?? '',
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
