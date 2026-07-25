/**
 * Pure form-mapping helpers for the inventory admin manager.
 *
 * The UI holds every field as a string (or boolean) while it is being edited;
 * these helpers coerce a draft into the validated service input and back again
 * for the edit dialog. Validation reuses the service zod schemas so the client
 * shows the same messages the server would raise.
 */

import { ingredientInputSchema, type IngredientInput } from '@/lib/inventory/ingredients-service'
import { unitInputSchema, type UnitInput } from '@/lib/inventory/units-service'
import type {
  InventoryItem,
  InventoryUnitRow,
  InventoryUnitDimension,
} from '@/types/database'

// ── Ingredients ──────────────────────────────────────────────────────────────

export interface IngredientDraft {
  name: string
  sku: string
  category: string
  stock_unit_id: string
  unit_cost: string
  reorder_level: string
  is_prep: boolean
  is_active: boolean
}

export const EMPTY_INGREDIENT_DRAFT: IngredientDraft = {
  name: '',
  sku: '',
  category: '',
  stock_unit_id: '',
  unit_cost: '',
  reorder_level: '',
  is_prep: false,
  is_active: true,
}

/** Blank string → null; keeps trimmed value otherwise. */
function nullableText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Blank string → 0; otherwise parsed as a number (NaN falls back to 0). */
function numberOrZero(value: string): number {
  const trimmed = value.trim()
  if (trimmed === '') return 0
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function buildIngredientInput(draft: IngredientDraft): IngredientInput {
  return ingredientInputSchema.parse({
    name: draft.name.trim(),
    sku: nullableText(draft.sku),
    category: nullableText(draft.category),
    stock_unit_id: draft.stock_unit_id,
    unit_cost: numberOrZero(draft.unit_cost),
    is_prep: draft.is_prep,
    image_url: null,
    reorder_level: numberOrZero(draft.reorder_level),
    is_active: draft.is_active,
  })
}

export function ingredientToDraft(item: InventoryItem): IngredientDraft {
  return {
    name: item.name,
    sku: item.sku ?? '',
    category: item.category ?? '',
    stock_unit_id: item.stock_unit_id,
    unit_cost: String(item.unit_cost),
    reorder_level: String(item.reorder_level),
    is_prep: item.is_prep,
    is_active: item.is_active,
  }
}

// ── Units ────────────────────────────────────────────────────────────────────

export interface UnitDraft {
  name: string
  abbreviation: string
  dimension: InventoryUnitDimension
  to_base_factor: string
  is_base: boolean
  is_active: boolean
}

export const EMPTY_UNIT_DRAFT: UnitDraft = {
  name: '',
  abbreviation: '',
  dimension: 'count',
  to_base_factor: '1',
  is_base: false,
  is_active: true,
}

export function buildUnitInput(draft: UnitDraft): UnitInput {
  return unitInputSchema.parse({
    name: draft.name.trim(),
    abbreviation: draft.abbreviation.trim(),
    dimension: draft.dimension,
    to_base_factor: numberOrZero(draft.to_base_factor),
    is_base: draft.is_base,
    is_active: draft.is_active,
  })
}

export function unitToDraft(row: InventoryUnitRow): UnitDraft {
  return {
    name: row.name,
    abbreviation: row.abbreviation,
    dimension: row.dimension,
    to_base_factor: String(row.to_base_factor),
    is_base: row.is_base,
    is_active: row.is_active,
  }
}
