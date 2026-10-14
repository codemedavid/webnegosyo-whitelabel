/**
 * Merchant-facing words for option and add-on recipes.
 *
 * Depletion ADDS an option's recipe to the dish's own recipe (× its portions);
 * it never replaces it. Labels that read as "the recipe" led merchants to type
 * the whole dish into a "Large" option and spend it twice. One place for the
 * wording so the menu editor's option rows and add-on rows say the same thing
 * (and the merchant app can mirror it).
 */

import type { ModifierStockMode } from '@/types/database'

/** Heading of an option's recipe editor. */
export const OPTION_RECIPE_LABEL = 'Extra ingredients for this choice'

/** Heading of a legacy add-on's recipe editor. */
export function addonRecipeLabel(addonName: string): string {
  return `Recipe for ${addonName || 'this add-on'} (extra)`
}

/** Shown inside every option/add-on recipe editor. */
export const OPTION_RECIPE_HINT =
  "Used on top of the dish's own recipe each time this is picked (× its portions). List only what it adds — not the whole dish."

/** What each stock-tracking choice really does, under the picker. */
export const STOCK_MODE_HINT: Record<ModifierStockMode, string> = {
  none: 'No separate count for this choice. If it has a recipe, those ingredients are still deducted on every sale.',
  simple: 'Sells out when the count reaches 0. A recipe on it only sets its cost — its ingredients are not deducted.',
  recipe: "Sells out when its ingredients run out. They are deducted on top of the dish's recipe.",
}
