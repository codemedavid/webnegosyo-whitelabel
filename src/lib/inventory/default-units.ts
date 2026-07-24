/**
 * Industry-standard starter units of measure seeded per tenant on first use.
 *
 * `to_base_factor` = how many canonical base units (gram / millilitre / piece)
 * one of this unit holds. The base unit of each dimension has factor 1 and
 * `is_base: true`. Same-dimension conversion is a ratio of these factors
 * (see `unit-conversion.ts`); cross-dimension conversion is unsupported.
 *
 * Pure data + a pure mapper so seeding is unit-tested without a database.
 */

import type { UnitDimension } from '@/lib/inventory/unit-conversion'

export interface DefaultUnit {
  name: string
  abbreviation: string
  dimension: UnitDimension
  to_base_factor: number
  is_base: boolean
}

/** A tenant-scoped row ready to insert into `inventory_units`. */
export interface DefaultUnitInsert extends DefaultUnit {
  tenant_id: string
}

export const DEFAULT_UNITS: readonly DefaultUnit[] = [
  // Weight — base gram
  { name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1, is_base: true },
  { name: 'Kilogram', abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000, is_base: false },
  { name: 'Milligram', abbreviation: 'mg', dimension: 'weight', to_base_factor: 0.001, is_base: false },
  { name: 'Ounce', abbreviation: 'oz', dimension: 'weight', to_base_factor: 28.3495, is_base: false },
  { name: 'Pound', abbreviation: 'lb', dimension: 'weight', to_base_factor: 453.592, is_base: false },
  // Volume — base millilitre
  { name: 'Millilitre', abbreviation: 'ml', dimension: 'volume', to_base_factor: 1, is_base: true },
  { name: 'Litre', abbreviation: 'L', dimension: 'volume', to_base_factor: 1000, is_base: false },
  { name: 'Teaspoon', abbreviation: 'tsp', dimension: 'volume', to_base_factor: 4.92892, is_base: false },
  { name: 'Tablespoon', abbreviation: 'tbsp', dimension: 'volume', to_base_factor: 14.7868, is_base: false },
  { name: 'Cup', abbreviation: 'cup', dimension: 'volume', to_base_factor: 236.588, is_base: false },
  // Count — base piece
  { name: 'Piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1, is_base: true },
  { name: 'Dozen', abbreviation: 'dozen', dimension: 'count', to_base_factor: 12, is_base: false },
]

/** Produce tenant-stamped insert rows for the default unit catalog. */
export function buildDefaultUnitInserts(tenantId: string): DefaultUnitInsert[] {
  return DEFAULT_UNITS.map((unit) => ({ ...unit, tenant_id: tenantId }))
}
