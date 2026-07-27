/**
 * Picking a dish to write a recipe for.
 *
 * The coverage tab could report that 51 dishes needed setting up, but reaching
 * one still meant navigating to the menu-item form and scrolling past the cost
 * fields — with no search, and losing your place on every save. On a real menu
 * that is unusable, which is why the first tenant to switch inventory on never
 * wrote a single recipe.
 *
 * These rules back the in-place picker: search by name, filter by whether the
 * dish is set up. Pure, so the merchant app can reuse them in Phase C.
 */

import type { RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'

export type CoverageFilter = 'all' | 'needs-recipe' | 'has-recipe'

/** Tab order, read left to right: everything, then what still needs work. */
export const COVERAGE_FILTERS: ReadonlyArray<{ value: CoverageFilter; label: string }> = [
  { value: 'all', label: 'All dishes' },
  { value: 'needs-recipe', label: 'Needs recipe' },
  { value: 'has-recipe', label: 'Set up' },
]

export interface CoverageQuery {
  query: string
  status: CoverageFilter
}

function matchesStatus(row: RecipeCoverageRow, status: CoverageFilter): boolean {
  if (status === 'needs-recipe') return !row.hasRecipe
  if (status === 'has-recipe') return row.hasRecipe
  return true
}

/**
 * The dishes matching a search and a status filter.
 *
 * Matches anywhere in the name rather than only the start: a merchant searches
 * for the word they remember ("adobo"), not the first word on the label
 * ("Chicken Adobo Rice").
 *
 * Deliberately does NOT re-sort. `buildRecipeCoverage` already put the
 * actionable dishes first, and re-ordering here would silently override it.
 */
export function filterCoverageRows(
  rows: readonly RecipeCoverageRow[],
  { query, status }: CoverageQuery,
): RecipeCoverageRow[] {
  const needle = query.trim().toLowerCase()
  return rows.filter(
    (row) =>
      matchesStatus(row, status) && (needle === '' || row.name.toLowerCase().includes(needle)),
  )
}

/** Totals for each filter chip, so a merchant sees the size of the job. */
export function countByStatus(
  rows: readonly RecipeCoverageRow[],
): Record<CoverageFilter, number> {
  const hasRecipe = rows.filter((row) => row.hasRecipe).length
  return {
    all: rows.length,
    'needs-recipe': rows.length - hasRecipe,
    'has-recipe': hasRecipe,
  }
}
