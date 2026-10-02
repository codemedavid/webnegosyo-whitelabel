/**
 * Pure decisions behind the Loyverse catalog import: what to write, what to
 * skip, what to adopt and what to retire. No network, no Supabase — the
 * importer (catalog-import.ts) reads, asks these, and writes.
 */

import type { ModifierGroup } from '@/types/database'
import type { LoyverseMapRow, MappedLoyverseItem } from '@/lib/loyverse/catalog-mapper'

/** A local dish as the importer reads it for comparison. */
export interface ExistingMenuRow {
  id: string
  loyverse_item_id?: string | null
  name?: string | null
  description?: string | null
  price?: number | string | null
  category_id?: string | null
  modifier_groups?: ModifierGroup[] | null
  is_available?: boolean | null
  image_url?: string | null
}

/** The synced columns of a dish, exactly as the import writes them. */
export interface MenuItemSyncFields {
  name: string
  description: string
  price: number
  category_id: string
  modifier_groups: ModifierGroup[]
  is_available: boolean
  image_url?: string
}

/**
 * JSON with object keys sorted. Postgres jsonb does not keep key order, so a
 * plain JSON.stringify would call every stored modifier group "changed".
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/**
 * True when writing `fields` would change nothing. Unchanged dishes are the
 * steady state — every Loyverse item edit re-imports the whole catalog — so
 * skipping them turns a re-sync from one UPDATE per dish into a handful.
 */
export function isMenuItemInSync(existing: ExistingMenuRow, fields: MenuItemSyncFields): boolean {
  return (
    (existing.name ?? '') === fields.name &&
    (existing.description ?? '') === fields.description &&
    Number(existing.price) === fields.price &&
    existing.category_id === fields.category_id &&
    existing.is_available === fields.is_available &&
    (fields.image_url === undefined || (existing.image_url ?? '') === fields.image_url) &&
    stableStringify(existing.modifier_groups ?? []) === stableStringify(fields.modifier_groups)
  )
}

/** A stored variant map row, as the importer reads it for comparison. */
export interface ExistingVariantMapRow {
  menu_item_id: string | null
  loyverse_item_id: string | null
  loyverse_variant_id: string | null
  local_key: string
  loyverse_sku: string | null
  in_stock?: number | string | null
}

function variantRowKey(row: {
  menu_item_id: string | null
  loyverse_variant_id: string | null
  local_key: string
  loyverse_sku: string | null
  in_stock?: number | string | null
}): string {
  const stock = row.in_stock === null || row.in_stock === undefined ? null : Number(row.in_stock)
  return stableStringify([row.menu_item_id, row.loyverse_variant_id, row.local_key, row.loyverse_sku, stock])
}

/** True when the stored variant rows already say exactly what `desired` says. */
export function isVariantMapInSync(
  existing: readonly ExistingVariantMapRow[],
  desired: ReadonlyArray<LoyverseMapRow & { menu_item_id: string | null }>
): boolean {
  if (existing.length !== desired.length) return false
  const have = existing.map(variantRowKey).sort()
  const want = desired.map(variantRowKey).sort()
  return have.every((key, index) => key === want[index])
}

/** A local dish with no Loyverse identity yet — adoptable by name. */
export interface UnclaimedRow {
  id: string
  name: string | null
  category_id: string | null
  image_url: string | null
}

const normalizeName = (name: string | null | undefined): string => (name ?? '').trim().toLowerCase()

/**
 * Returns an adopter that hands out each unclaimed dish at most once. Prefers
 * a same-category match; falls back to a tenant-wide name match so a dish
 * whose category drifted is adopted rather than duplicated. Ambiguity is
 * resolved deterministically (first match) because the alternative —
 * inserting — is the duplication adoption exists to stop.
 */
export function createAdopter(
  unclaimed: readonly UnclaimedRow[]
): (name: string, categoryId: string | null) => UnclaimedRow | null {
  const byName = new Map<string, UnclaimedRow[]>()
  for (const row of unclaimed) {
    const key = normalizeName(row.name)
    const list = byName.get(key)
    if (list) list.push(row)
    else byName.set(key, [row])
  }
  return (name, categoryId) => {
    const candidates = byName.get(normalizeName(name))
    if (!candidates || candidates.length === 0) return null
    const index = Math.max(0, candidates.findIndex((row) => row.category_id === categoryId))
    const [chosen] = candidates.splice(index, 1)
    return chosen
  }
}

/** Category names to create, deduplicated case-insensitively against each other and what exists. */
export function categoriesToCreate(
  items: readonly MappedLoyverseItem[],
  categoryNames: Readonly<Record<string, string>>,
  existingLowercase: ReadonlySet<string>
): string[] {
  const needed = new Map<string, string>()
  for (const item of items) {
    const name = item.categoryLoyverseId ? categoryNames[item.categoryLoyverseId] : undefined
    const key = name?.toLowerCase()
    if (name && key && !existingLowercase.has(key) && !needed.has(key)) needed.set(key, name)
  }
  return [...needed.values()]
}

/**
 * Local dishes whose Loyverse item is gone (deleted, or no longer importable
 * — sold by weight, variable price). They used to stay on the menu forever,
 * orderable, and every receipt containing one was rejected by Loyverse.
 *
 * An empty live catalog retires nothing: that is far more likely a wrong or
 * swapped token than a merchant who deleted every item.
 */
export function findRetiredMenuItemIds(
  identified: ReadonlyArray<{ id: string; loyverse_item_id: string | null }>,
  liveLoyverseItemIds: ReadonlySet<string>
): string[] {
  if (liveLoyverseItemIds.size === 0) return []
  return identified
    .filter((row) => row.loyverse_item_id && !liveLoyverseItemIds.has(row.loyverse_item_id))
    .map((row) => row.id)
}
