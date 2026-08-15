/**
 * Pure mapping from a Loyverse catalog to local menu shapes.
 *
 * No network, no database — the importer feeds it the fetched catalog and
 * writes what comes out. Everything Loyverse can express that we cannot
 * (sold-by-weight, variable pricing) is skipped with a human-readable
 * warning so the sync report never silently drops a dish.
 *
 * ID strategy: local modifier option ids are deterministic functions of the
 * Loyverse ids (`lv-<variant_id>`, `lvm-<modifier_option_id>`) so a re-sync
 * produces byte-identical menu JSON instead of churning every option id.
 */

import type { ModifierGroup, ModifierOption } from '@/types/database'

export interface LoyverseCatalogCategory {
  id: string
  name: string
  deleted_at?: string | null
}

export interface LoyverseCatalogModifierOption {
  id: string
  name: string
  price?: number
  position?: number
}

export interface LoyverseCatalogModifier {
  id: string
  name: string
  position?: number
  modifier_options?: LoyverseCatalogModifierOption[]
}

export interface LoyverseVariantStore {
  store_id: string
  pricing_type?: string
  price?: number | null
  available_for_sale?: boolean
}

export interface LoyverseCatalogVariant {
  variant_id: string
  item_id: string
  sku?: string | null
  option1_value?: string | null
  option2_value?: string | null
  option3_value?: string | null
  default_pricing_type?: string
  default_price?: number | null
  stores?: LoyverseVariantStore[]
}

export interface LoyverseCatalogItem {
  id: string
  item_name: string
  description?: string | null
  category_id?: string | null
  image_url?: string | null
  sold_by_weight?: boolean
  track_stock?: boolean
  modifiers_ids?: string[]
  option1_name?: string | null
  option2_name?: string | null
  option3_name?: string | null
  variants?: LoyverseCatalogVariant[]
  deleted_at?: string | null
}

export interface LoyverseCatalogStockLevel {
  variant_id: string
  store_id: string
  in_stock?: number | null
}

export interface LoyverseCatalogInput {
  storeId: string
  categories: LoyverseCatalogCategory[]
  modifiers: LoyverseCatalogModifier[]
  items: LoyverseCatalogItem[]
  /**
   * GET /inventory levels, so the very first sync 86es what is already dry
   * instead of waiting for a webhook delta. Optional: absent means "no stock
   * information", never "everything is out".
   */
  inventoryLevels?: LoyverseCatalogStockLevel[]
}

export interface LoyverseMapRow {
  kind: 'variant' | 'modifier_option'
  local_key: string
  loyverse_item_id: string | null
  loyverse_variant_id: string | null
  loyverse_modifier_id: string | null
  loyverse_modifier_option_id: string | null
  loyverse_sku: string | null
}

export interface MappedLoyverseItem {
  loyverseItemId: string
  name: string
  description: string
  imageUrl: string | null
  categoryLoyverseId: string | null
  price: number
  isAvailable: boolean
  modifierGroups: ModifierGroup[]
  mapRows: LoyverseMapRow[]
}

export interface LoyverseCatalogMapping {
  items: MappedLoyverseItem[]
  /** Loyverse category id → name, deleted categories excluded. */
  categoryNames: Record<string, string>
  warnings: string[]
}

interface ResolvedVariant {
  variant: LoyverseCatalogVariant
  price: number
  isAvailable: boolean
}

/** Store override wins over the account-wide default price. */
function resolveVariantForStore(
  variant: LoyverseCatalogVariant,
  storeId: string
): ResolvedVariant | { error: 'variable' } {
  const store = variant.stores?.find((s) => s.store_id === storeId)
  const pricingType = store?.pricing_type ?? variant.default_pricing_type ?? 'FIXED'
  if (pricingType !== 'FIXED') return { error: 'variable' }

  const price = store?.price ?? variant.default_price
  if (typeof price !== 'number') return { error: 'variable' }

  return {
    variant,
    price,
    isAvailable: store?.available_for_sale ?? true,
  }
}

function variantOptionLabel(variant: LoyverseCatalogVariant): string {
  return [variant.option1_value, variant.option2_value, variant.option3_value]
    .filter((v): v is string => Boolean(v?.trim()))
    .join(' / ')
}

function axisGroupName(item: LoyverseCatalogItem): string {
  return [item.option1_name, item.option2_name, item.option3_name]
    .filter((v): v is string => Boolean(v?.trim()))
    .join(' / ')
}

function modifierToGroup(
  modifier: LoyverseCatalogModifier,
  displayOrder: number
): { group: ModifierGroup; mapRows: LoyverseMapRow[] } {
  const sortedOptions = [...(modifier.modifier_options ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  )
  const options: ModifierOption[] = sortedOptions.map((option, index) => ({
    id: `lvm-${option.id}`,
    name: option.name,
    price_modifier: option.price ?? 0,
    display_order: index,
  }))
  const mapRows: LoyverseMapRow[] = sortedOptions.map((option) => ({
    kind: 'modifier_option',
    local_key: `lvm-${option.id}`,
    loyverse_item_id: null,
    loyverse_variant_id: null,
    loyverse_modifier_id: modifier.id,
    loyverse_modifier_option_id: option.id,
    loyverse_sku: null,
  }))
  return {
    group: {
      id: `lvm-group-${modifier.id}`,
      name: modifier.name,
      display_order: displayOrder,
      min_select: 0,
      max_select: null,
      options,
    },
    mapRows,
  }
}

export function mapLoyverseCatalog(input: LoyverseCatalogInput): LoyverseCatalogMapping {
  const warnings: string[] = []
  const items: MappedLoyverseItem[] = []

  const categoryNames: Record<string, string> = {}
  for (const category of input.categories) {
    if (!category.deleted_at) categoryNames[category.id] = category.name
  }

  const modifiersById = new Map(input.modifiers.map((m) => [m.id, m]))

  // Stock at the mapped store, by variant. A variant absent from the map has
  // no reported level and is treated as in stock — false "sold out" hides
  // revenue, false "available" merely fails at the register.
  const stockByVariant = new Map<string, number>()
  for (const level of input.inventoryLevels ?? []) {
    if (level.store_id === input.storeId) {
      stockByVariant.set(level.variant_id, level.in_stock ?? 0)
    }
  }
  const isVariantOutOfStock = (variantId: string): boolean => {
    const level = stockByVariant.get(variantId)
    return level !== undefined && level <= 0
  }

  for (const item of input.items) {
    if (item.deleted_at) continue

    if (item.sold_by_weight) {
      warnings.push(`Skipped "${item.item_name}": sold-by-weight items are not supported`)
      continue
    }

    const resolved: ResolvedVariant[] = []
    let hasVariablePricing = false
    for (const variant of item.variants ?? []) {
      const result = resolveVariantForStore(variant, input.storeId)
      if ('error' in result) {
        hasVariablePricing = true
        break
      }
      resolved.push(result)
    }

    if (hasVariablePricing) {
      warnings.push(`Skipped "${item.item_name}": variable-priced items are not supported`)
      continue
    }
    if (resolved.length === 0) {
      warnings.push(`Skipped "${item.item_name}": no sellable variants`)
      continue
    }

    const basePrice = Math.min(...resolved.map((r) => r.price))
    const modifierGroups: ModifierGroup[] = []
    const mapRows: LoyverseMapRow[] = []

    if (resolved.length === 1) {
      // Single variant: the item itself is the variant; empty local_key.
      mapRows.push({
        kind: 'variant',
        local_key: '',
        loyverse_item_id: item.id,
        loyverse_variant_id: resolved[0].variant.variant_id,
        loyverse_modifier_id: null,
        loyverse_modifier_option_id: null,
        loyverse_sku: resolved[0].variant.sku ?? null,
      })
    } else {
      // One axis keeps its name; 2-3 axes collapse into one combined group so
      // per-combination pricing stays exact (our groups price independently,
      // Loyverse variants price the combination).
      const options: ModifierOption[] = resolved.map((r, index) => ({
        id: `lv-${r.variant.variant_id}`,
        name: variantOptionLabel(r.variant) || `Variant ${index + 1}`,
        price_modifier: r.price - basePrice,
        display_order: index,
      }))
      modifierGroups.push({
        id: `lv-group-${item.id}`,
        name: axisGroupName(item) || 'Options',
        display_order: 0,
        min_select: 1,
        max_select: 1,
        options,
      })
      for (const r of resolved) {
        mapRows.push({
          kind: 'variant',
          local_key: `lv-${r.variant.variant_id}`,
          loyverse_item_id: item.id,
          loyverse_variant_id: r.variant.variant_id,
          loyverse_modifier_id: null,
          loyverse_modifier_option_id: null,
          loyverse_sku: r.variant.sku ?? null,
        })
      }
    }

    for (const modifierId of item.modifiers_ids ?? []) {
      const modifier = modifiersById.get(modifierId)
      if (!modifier) {
        warnings.push(`"${item.item_name}": modifier ${modifierId} not found in catalog`)
        continue
      }
      const { group, mapRows: modifierMapRows } = modifierToGroup(modifier, modifierGroups.length)
      modifierGroups.push(group)
      mapRows.push(...modifierMapRows)
    }

    items.push({
      loyverseItemId: item.id,
      name: item.item_name,
      description: item.description ?? '',
      imageUrl: item.image_url ?? null,
      categoryLoyverseId: item.category_id ?? null,
      price: basePrice,
      // Available when ANY variant is sellable at this store AND, for
      // stock-tracked items, at least one variant still has stock. Per-variant
      // availability inside a combined group is a later refinement.
      isAvailable:
        resolved.some((r) => r.isAvailable) &&
        (!item.track_stock ||
          resolved.some((r) => !isVariantOutOfStock(r.variant.variant_id))),
      modifierGroups,
      mapRows,
    })
  }

  return { items, categoryNames, warnings }
}
