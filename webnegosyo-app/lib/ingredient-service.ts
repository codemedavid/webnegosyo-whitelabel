/**
 * Creating, editing and archiving ingredients from the merchant app, and
 * reading one ingredient's ledger.
 *
 * Writes go straight to `inventory_items` on the merchant's own session: its
 * RLS policy lets a tenant's admins manage their own rows, exactly what the web
 * editor relies on (src/lib/inventory/ingredients-service.ts). Unlike a stock
 * movement there is no server-side arithmetic to protect — an ingredient row is
 * a definition, not a quantity — so no platform route is needed. Quantities
 * NEVER go through here; opening stock is recorded as a count through
 * lib/inventory-movement-service.ts so the ledger explains it.
 *
 * Validation: lib/ingredient-form.ts. Every failure throws a sentence worth
 * showing; nothing here is swallowed.
 */

import { supabase } from "./supabase";
import {
  buildDefaultUnitInserts,
  type IngredientPayload,
  type IngredientRecord,
  type UnitDimension,
  type UnitOption,
} from "./ingredient-form";
import type { MovementRow } from "./stock-history";

const RECORD_COLUMNS =
  "id, name, sku, category, stock_unit_id, unit_cost, reorder_level, is_prep, is_active, current_qty";
const UNIT_COLUMNS = "id, name, abbreviation, dimension, to_base_factor, is_active";
const MOVEMENT_COLUMNS =
  "id, reason, quantity_delta, balance_after, note, order_id, created_at, outlet_id";

/** Enough history for a phone screen; the web log has the rest. */
export const HISTORY_LIMIT = 60;

interface UnitRow {
  id: string;
  name: string;
  abbreviation: string;
  dimension: UnitDimension;
  to_base_factor: number;
  is_active: boolean;
}

function toUnitOption(row: UnitRow): UnitOption {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    dimension: row.dimension,
    toBaseFactor: Number(row.to_base_factor),
  };
}

function toRecord(row: Record<string, unknown>): IngredientRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    sku: (row.sku as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    stock_unit_id: String(row.stock_unit_id ?? ""),
    unit_cost: Number(row.unit_cost ?? 0),
    reorder_level: Number(row.reorder_level ?? 0),
    is_prep: Boolean(row.is_prep),
    is_active: row.is_active !== false,
    current_qty: Number(row.current_qty ?? 0),
  };
}

async function readUnits(tenantId: string): Promise<UnitRow[]> {
  const { data, error } = await supabase
    .from("inventory_units")
    .select(UNIT_COLUMNS)
    .eq("tenant_id", tenantId);
  if (error) throw new Error("Could not load your units. Try again.");
  return (data ?? []) as unknown as UnitRow[];
}

/**
 * The tenant's active units, seeding the starter catalog on first use.
 *
 * The web seeds the same catalog on its first inventory visit; a store that
 * only ever opens the app would otherwise have no unit to choose and could
 * never create an ingredient. A failed seed (most likely the web seeding at
 * the same moment, tripping the unique abbreviation index) is followed by a
 * re-read rather than reported, since the units it wanted now exist.
 */
export async function loadUnitOptions(tenantId: string): Promise<UnitOption[]> {
  if (!tenantId) return [];

  let rows = await readUnits(tenantId);
  if (rows.length === 0) {
    // The insert's own error is not decisive (a concurrent web seed trips the
    // unique index and still leaves units behind); the re-read is.
    await supabase.from("inventory_units").insert(buildDefaultUnitInserts(tenantId) as never);
    rows = await readUnits(tenantId);
    if (rows.length === 0) {
      throw new Error("Could not set up your units. Check your connection and try again.");
    }
  }
  return rows.filter((row) => row.is_active).map(toUnitOption);
}

export interface IngredientIndexRow {
  id: string;
  name: string;
  category: string | null;
  is_active: boolean;
}

/**
 * Every ingredient, archived included — for name clashes, category
 * suggestions and the archive list.
 */
export async function loadIngredientIndex(tenantId: string): Promise<IngredientIndexRow[]> {
  if (!tenantId) return [];
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, name, category, is_active")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });
  if (error) throw new Error("Could not load your ingredients. Try again.");
  return (data ?? []) as unknown as IngredientIndexRow[];
}

/** One ingredient, or null when it no longer exists (deleted on the web). */
export async function loadIngredientRecord(
  tenantId: string,
  ingredientId: string,
): Promise<IngredientRecord | null> {
  if (!tenantId || !ingredientId) return null;
  const { data, error } = await supabase
    .from("inventory_items")
    .select(RECORD_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", ingredientId)
    .maybeSingle();
  if (error) throw new Error("Could not load this ingredient. Try again.");
  return data ? toRecord(data as Record<string, unknown>) : null;
}

/** Insert a new ingredient. Resolves with its id. */
export async function createIngredient(
  tenantId: string,
  payload: IngredientPayload,
): Promise<string> {
  if (!tenantId) throw new Error("Your session has expired. Sign in and try again.");
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({ tenant_id: tenantId, ...payload } as never)
    .select("id")
    .single();
  if (error || !data) throw new Error("The ingredient was not saved. Try again.");
  return String((data as { id: string }).id);
}

/**
 * Update an ingredient. A zero-row update (RLS refusal, or the row deleted on
 * the web meanwhile) is an ERROR: PostgREST reports it as success, and saying
 * "Saved" over a write that never landed is the one thing this must not do.
 */
export async function updateIngredient(
  tenantId: string,
  ingredientId: string,
  payload: Partial<IngredientPayload>,
): Promise<void> {
  const { data, error } = await supabase
    .from("inventory_items")
    .update({ ...payload, updated_at: new Date().toISOString() } as never)
    .eq("tenant_id", tenantId)
    .eq("id", ingredientId)
    .select("id");
  if (error) throw new Error("The changes were not saved. Try again.");
  if (!data || (data as unknown[]).length === 0) {
    throw new Error("This ingredient could not be changed. It may have been removed, or your account cannot edit stock.");
  }
}

/** Archive (hide from the shelf, keep the history) or restore. */
export function setIngredientActive(
  tenantId: string,
  ingredientId: string,
  isActive: boolean,
): Promise<void> {
  return updateIngredient(tenantId, ingredientId, { is_active: isActive });
}

/**
 * The newest movements for one ingredient, newest first.
 *
 * `outletId` follows the shelf: undefined = the whole store (every branch's
 * rows), null = the unbranched pool only, a string = that branch. RLS already
 * keeps a branch manager to their own branch's rows.
 */
export async function loadIngredientMovements(
  tenantId: string,
  ingredientId: string,
  outletId?: string | null,
): Promise<MovementRow[]> {
  if (!tenantId || !ingredientId) return [];

  const base = supabase
    .from("stock_movements")
    .select(MOVEMENT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("inventory_item_id", ingredientId);
  // `outlet_id = NULL` matches nothing in SQL, so the store pool needs IS NULL.
  const scoped =
    outletId === undefined
      ? base
      : outletId === null
        ? base.is("outlet_id", null)
        : base.eq("outlet_id", outletId);

  const { data, error } = await scoped
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error("Could not load the stock history. Pull down to try again.");
  return (data ?? []) as unknown as MovementRow[];
}
