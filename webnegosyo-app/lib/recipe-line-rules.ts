/**
 * Whether a recipe line can ever be deducted — the rule every recipe writer
 * applies before saving.
 *
 * Mirrors the web app's `src/lib/inventory/recipe-line-rules.ts` and the
 * conversion rule in `src/lib/inventory/unit-conversion.ts` word for word (the
 * app cannot import root `src/`). A line asking for nothing, or measured in a
 * unit that can never convert to the ingredient's stock unit (grams of an egg
 * stocked by the piece), would be saved and then silently skipped by every
 * sale. Weight ↔ volume converts (1 g = 1 ml); count never converts to either.
 *
 * Pure.
 */

export type UnitDimension = "weight" | "volume" | "count";

export interface RuleUnit {
  id: string;
  abbreviation: string;
  /** Absent when the catalog row carries none — such a unit is not judged. */
  dimension?: UnitDimension | null;
}

export interface RuleIngredient {
  name: string;
  stockUnitId: string | null;
}

export interface RuleLine {
  quantity: number;
  unitId: string;
}

const MASS_LIKE: ReadonlySet<UnitDimension> = new Set(["weight", "volume"]);

const KIND_WORD: Record<UnitDimension, string> = {
  weight: "a weight",
  volume: "a volume",
  count: "a count",
};

/**
 * Whether a quantity in `from` can be expressed in `to`. Same dimension, or
 * weight ↔ volume. A unit without a dimension cannot convert — the sale-time
 * converter (web `unit-conversion.ts`) refuses it, so a line in it would never
 * deduct.
 */
export function canConvertUnits(from: RuleUnit, to: RuleUnit): boolean {
  if (!from.dimension || !to.dimension) return false;
  if (from.dimension === to.dimension) return true;
  return MASS_LIKE.has(from.dimension) && MASS_LIKE.has(to.dimension);
}

/**
 * Why this line cannot be saved, in words for the merchant, or null when it is
 * fine. An ingredient whose stock unit is missing from the catalogue only has
 * its quantity checked — refusing on our own data gap would block every save.
 */
export function recipeLineProblem(
  line: RuleLine,
  ingredient: RuleIngredient,
  units: readonly RuleUnit[],
): string | null {
  const name = ingredient.name || "this ingredient";
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    return `Enter how much ${name} this uses — it must be more than 0.`;
  }

  const stockUnit = units.find((unit) => unit.id === ingredient.stockUnitId);
  if (!stockUnit) return null;

  const unit = units.find((candidate) => candidate.id === line.unitId);
  if (!unit) {
    return `Choose a unit for ${name} (it is stocked in ${stockUnit.abbreviation}).`;
  }

  if (!canConvertUnits(unit, stockUnit)) {
    const kind = stockUnit.dimension ? KIND_WORD[stockUnit.dimension] : "a";
    return `${name} is stocked in ${stockUnit.abbreviation}, so it can't be measured in ${unit.abbreviation} — sales would never deduct it. Use ${kind} unit like ${stockUnit.abbreviation}.`;
  }

  return null;
}

/**
 * The units a line for an ingredient stocked in `stockUnitId` may use. Every
 * unit when the stock unit is unknown, so the picker is never empty.
 */
export function compatibleRecipeUnits<T extends RuleUnit>(
  stockUnitId: string | null,
  units: readonly T[],
): T[] {
  const stockUnit = units.find((unit) => unit.id === stockUnitId);
  if (!stockUnit) return [...units];
  return units.filter((unit) => canConvertUnits(unit, stockUnit));
}

/** Read a catalog value as a dimension, or null when it is not one. */
export function toUnitDimension(value: unknown): UnitDimension | null {
  return value === "weight" || value === "volume" || value === "count" ? value : null;
}
