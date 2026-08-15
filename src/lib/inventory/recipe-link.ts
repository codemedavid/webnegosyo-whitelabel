/**
 * Which dishes are actually linked to inventory — the cheap, id-set answer.
 *
 * `recipe-coverage.ts` builds the full per-dish picture for the inventory
 * screen. The menu list needs far less: just the ids whose sales will deduct
 * stock, so it can badge the ones that silently won't. One query feeds this
 * (recipe components joined to their recipe), and the rule matches coverage
 * and auto-86: only a `menu_item` recipe with at least one component makes the
 * dish itself depletable — an empty recipe row is a shell that deducts nothing.
 *
 * Pure, so the rule is provable without a database.
 */

/** One `recipe_components` row with its recipe joined in. */
export interface RecipeLinkRow {
  recipes: {
    menu_item_id: string | null
    target_type: string
  } | null
}

/** Ids of every dish whose base recipe lists at least one ingredient. */
export function collectLinkedMenuItemIds(rows: readonly RecipeLinkRow[]): string[] {
  const linked = new Set<string>()
  for (const row of rows) {
    const recipe = row.recipes
    if (!recipe) continue
    if (recipe.target_type !== 'menu_item') continue
    if (!recipe.menu_item_id) continue
    linked.add(recipe.menu_item_id)
  }
  return [...linked]
}
