/**
 * Pure rules for creating and editing an ingredient from the phone.
 *
 * The app writes `inventory_items` straight through RLS (admins manage their
 * own tenant's rows), so these rules are the only validation the row gets
 * before Postgres. They restate the web's `ingredientInputSchema`
 * (src/lib/inventory/schemas.ts): a row the phone accepts and the web editor
 * would refuse is a row the web editor can no longer save.
 *
 * Network calls: lib/ingredient-service.ts. Screen: app/(main)/ingredient-editor.tsx.
 */

export type UnitDimension = "weight" | "volume" | "count";

/** A unit as the editor offers it. */
export interface UnitOption {
  id: string;
  name: string;
  abbreviation: string;
  dimension: UnitDimension;
  toBaseFactor: number;
}

/** The `inventory_items` columns the editor reads. */
export interface IngredientRecord {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  stock_unit_id: string;
  unit_cost: number;
  reorder_level: number;
  is_prep: boolean;
  is_active: boolean;
  /** The store roll-up — only consulted to decide whether the unit may change. */
  current_qty: number;
}

/** What the form holds while it is being typed. Numbers stay strings until save. */
export interface IngredientDraft {
  name: string;
  category: string;
  sku: string;
  stockUnitId: string | null;
  unitCost: string;
  reorderLevel: string;
  isPrep: boolean;
  isActive: boolean;
}

/** Exactly the columns written on insert/update (tenant_id is added by the service). */
export interface IngredientPayload {
  name: string;
  sku: string | null;
  category: string | null;
  stock_unit_id: string;
  unit_cost: number;
  reorder_level: number;
  is_prep: boolean;
  is_active: boolean;
}

export const EMPTY_INGREDIENT_DRAFT: IngredientDraft = {
  name: "",
  category: "",
  sku: "",
  stockUnitId: null,
  unitCost: "",
  reorderLevel: "",
  isPrep: false,
  isActive: true,
};

/** Shown to a store with no categories of its own yet. */
const STARTER_CATEGORIES: readonly string[] = [
  "Produce",
  "Meat & seafood",
  "Dairy",
  "Dry goods",
  "Beverages",
  "Packaging",
];

const DIMENSION_ORDER: readonly UnitDimension[] = ["weight", "volume", "count"];

export const DIMENSION_LABELS: Record<UnitDimension, string> = {
  weight: "Weight",
  volume: "Volume",
  count: "Count",
};

/** Mirrors QUANTITY_EPSILON in inventory-stock.ts — dust is not stock. */
const QUANTITY_EPSILON = 1e-4;

/** Trims the trailing zeros a NUMERIC round-trip leaves behind. */
function formatNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

/**
 * A typed amount, or null while blank. Peso signs, spaces and thousands
 * separators are what a merchant types off a supplier's receipt, so they are
 * read rather than refused. Returns NaN for anything else that is not a number.
 */
function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[₱,\s]/g, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Coerce a draft into the row, or throw a message worth showing. */
export function buildIngredientPayload(draft: IngredientDraft): IngredientPayload {
  const name = draft.name.trim();
  if (name === "") throw new Error("Give the ingredient a name");
  if (!draft.stockUnitId) throw new Error("Choose the unit you stock it in");

  const unitCost = parseAmount(draft.unitCost);
  if (unitCost !== null && (Number.isNaN(unitCost) || unitCost < 0)) {
    throw new Error("Enter the cost as a positive number");
  }

  const reorderLevel = parseAmount(draft.reorderLevel);
  if (reorderLevel !== null && (Number.isNaN(reorderLevel) || reorderLevel < 0)) {
    throw new Error("Enter the reorder level as a positive number");
  }

  return {
    name,
    sku: blankToNull(draft.sku),
    category: blankToNull(draft.category),
    stock_unit_id: draft.stockUnitId,
    unit_cost: unitCost ?? 0,
    reorder_level: reorderLevel ?? 0,
    is_prep: draft.isPrep,
    is_active: draft.isActive,
  };
}

/** The form, filled from a saved row. */
export function draftFromIngredient(row: IngredientRecord): IngredientDraft {
  return {
    name: row.name,
    category: row.category ?? "",
    sku: row.sku ?? "",
    stockUnitId: row.stock_unit_id,
    // A zero shows as a blank so the placeholder can say what the field does.
    unitCost: row.unit_cost > 0 ? formatNumber(Number(row.unit_cost)) : "",
    reorderLevel: row.reorder_level > 0 ? formatNumber(Number(row.reorder_level)) : "",
    isPrep: row.is_prep,
    isActive: row.is_active,
  };
}

/**
 * Whether the stock unit may be changed.
 *
 * `current_qty` is a bare number interpreted in the stock unit, so switching
 * kg → g with 12 on the shelf turns 12 kg of flour into 12 g — no movement, no
 * ledger row, just a different shelf. The unit is therefore locked while
 * anything (positive or negative) is on hand; count it to zero first.
 */
export function canChangeStockUnit(existing: IngredientRecord | null): boolean {
  if (!existing) return true;
  return Math.abs(Number(existing.current_qty)) <= QUANTITY_EPSILON;
}

/**
 * The amount on the shelf when the ingredient is created, recorded afterwards
 * as a count so the ledger explains where it came from. Null = nothing to record.
 */
export function parseOpeningStock(value: string): number | null {
  const amount = parseAmount(value);
  if (amount === null) return null;
  if (Number.isNaN(amount) || amount < 0) {
    throw new Error("Enter the opening stock as a positive number");
  }
  return amount <= QUANTITY_EPSILON ? null : amount;
}

/** The categories already in use, or a starter set for a store with none. */
export function suggestCategories(
  rows: readonly { category: string | null | undefined }[],
): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const trimmed = row.category?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  const used = [...seen.values()].sort((a, b) => a.localeCompare(b));
  return used.length > 0 ? used : [...STARTER_CATEGORIES];
}

export interface UnitGroup {
  dimension: UnitDimension;
  label: string;
  units: UnitOption[];
}

/** Weight, volume, count — each smallest unit first. Empty groups omitted. */
export function groupUnitsByDimension(units: readonly UnitOption[]): UnitGroup[] {
  return DIMENSION_ORDER.map((dimension) => ({
    dimension,
    label: DIMENSION_LABELS[dimension],
    units: units
      .filter((unit) => unit.dimension === dimension)
      .sort((a, b) => a.toBaseFactor - b.toBaseFactor),
  })).filter((group) => group.units.length > 0);
}

export interface DefaultUnit {
  name: string;
  abbreviation: string;
  dimension: UnitDimension;
  to_base_factor: number;
  is_base: boolean;
}

/**
 * The starter catalog. Mirrors `DEFAULT_UNITS` in
 * src/lib/inventory/default-units.ts — the web seeds it on its first inventory
 * visit, and a store that only ever opens the app needs the same units.
 */
export const DEFAULT_UNITS: readonly DefaultUnit[] = [
  { name: "Gram", abbreviation: "g", dimension: "weight", to_base_factor: 1, is_base: true },
  { name: "Kilogram", abbreviation: "kg", dimension: "weight", to_base_factor: 1000, is_base: false },
  { name: "Milligram", abbreviation: "mg", dimension: "weight", to_base_factor: 0.001, is_base: false },
  { name: "Ounce", abbreviation: "oz", dimension: "weight", to_base_factor: 28.3495, is_base: false },
  { name: "Pound", abbreviation: "lb", dimension: "weight", to_base_factor: 453.592, is_base: false },
  { name: "Millilitre", abbreviation: "ml", dimension: "volume", to_base_factor: 1, is_base: true },
  { name: "Litre", abbreviation: "L", dimension: "volume", to_base_factor: 1000, is_base: false },
  { name: "Teaspoon", abbreviation: "tsp", dimension: "volume", to_base_factor: 4.92892, is_base: false },
  { name: "Tablespoon", abbreviation: "tbsp", dimension: "volume", to_base_factor: 14.7868, is_base: false },
  { name: "Cup", abbreviation: "cup", dimension: "volume", to_base_factor: 236.588, is_base: false },
  { name: "Piece", abbreviation: "pc", dimension: "count", to_base_factor: 1, is_base: true },
  { name: "Dozen", abbreviation: "dozen", dimension: "count", to_base_factor: 12, is_base: false },
];

export function buildDefaultUnitInserts(tenantId: string): (DefaultUnit & { tenant_id: string })[] {
  return DEFAULT_UNITS.map((unit) => ({ ...unit, tenant_id: tenantId }));
}

/**
 * The name of an existing ingredient this one would duplicate, or null.
 *
 * A warning, not a block: nothing in the schema forbids two "Rice" rows, and a
 * store may genuinely stock two. But it is far more often a second tap on
 * Save, and two rows splitting one sack's stock is how a shelf stops adding up.
 */
export function findNameClash(
  name: string,
  rows: readonly { id: string; name: string }[],
  editingId: string | null,
): string | null {
  const wanted = name.trim().toLowerCase();
  if (wanted === "") return null;
  const clash = rows.find((row) => row.id !== editingId && row.name.trim().toLowerCase() === wanted);
  return clash ? clash.name : null;
}
