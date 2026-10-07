/**
 * The recipe editor's screen-side decisions, kept out of the component so they
 * can be tested: what a typed amount means, how a stored amount reads back,
 * and which ingredients the "Add ingredient" sheet offers.
 *
 * The service (recipe-service.ts) still refuses a non-positive quantity on its
 * own; this is the friendlier first check that lets the row say so inline
 * instead of a round trip ending in an alert.
 */

import type { IngredientOption, RecipeComponentView } from "./recipe-service";

export type QuantityDraftResult = { ok: true; value: number } | { ok: false; error: string };

const QUANTITY_ERROR = "Enter an amount more than 0.";

/** A numeric column comes back as "0.2500"; four places covers every unit in use. */
const DISPLAY_DECIMALS = 4;

/** Strictly a number: digits with at most one decimal point. */
const DECIMAL_PATTERN = /^\d*\.?\d+$|^\d+\.$/;

/**
 * Read what the merchant typed into a quantity box.
 *
 * A decimal comma is accepted because many Android keypads in the region type
 * "1,5" for one and a half; refusing it would read as the box being broken.
 */
export function parseQuantityDraft(draft: string): QuantityDraftResult {
  const normalized = draft.trim().replace(",", ".");
  if (!DECIMAL_PATTERN.test(normalized)) return { ok: false, error: QUANTITY_ERROR };

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: QUANTITY_ERROR };
  return { ok: true, value };
}

/** A stored quantity as the merchant would write it: no padding, no float noise. */
export function formatRecipeQuantity(quantity: number): string {
  return String(Number(quantity.toFixed(DISPLAY_DECIMALS)));
}

export interface IngredientChoice {
  option: IngredientOption;
  /** Already a line on this recipe — shown, but not addable twice. */
  isAdded: boolean;
}

/**
 * The ingredients the "Add" sheet lists, narrowed by the search box.
 *
 * Ingredients already on the recipe stay in the list, marked and sorted last,
 * rather than vanishing: a merchant searching for "milk" who finds nothing
 * cannot tell "already added" from "not in inventory".
 */
export function buildIngredientChoices(
  ingredients: readonly IngredientOption[],
  components: readonly RecipeComponentView[],
  query: string,
): IngredientChoice[] {
  const used = new Set(components.map((component) => component.inventoryItemId));
  const needle = query.trim().toLowerCase();
  const matches = ingredients
    .filter((option) => needle === "" || option.name.toLowerCase().includes(needle))
    .map((option) => ({ option, isAdded: used.has(option.id) }));

  return [
    ...matches.filter((choice) => !choice.isAdded),
    ...matches.filter((choice) => choice.isAdded),
  ];
}
