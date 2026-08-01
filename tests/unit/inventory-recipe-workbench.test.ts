/**
 * Finding the dish you want to write a recipe for.
 *
 * The Recipes tab could say *that* 51 dishes needed setting up, but getting to
 * one still meant leaving for the menu-item form and scrolling to the bottom.
 * With a real menu that is unusable: you cannot search, and you lose your place
 * on every save.
 *
 * These are the rules behind picking a dish in place — search and a status
 * filter — so the editor can sit right next to the list.
 */

import {
  COVERAGE_FILTERS,
  filterCoverageRows,
  countByStatus,
  type CoverageFilter,
} from '@/lib/inventory/recipe-workbench'
import type { RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'

const ROWS: RecipeCoverageRow[] = [
  { menuItemId: 'm1', name: 'Adobo', hasRecipe: true, ingredientCount: 3 },
  { menuItemId: 'm2', name: 'Bicol Express', hasRecipe: false, ingredientCount: 0 },
  { menuItemId: 'm3', name: 'Chicken Adobo Rice', hasRecipe: false, ingredientCount: 0 },
]

function names(rows: RecipeCoverageRow[]): string[] {
  return rows.map((row) => row.name)
}

describe('filterCoverageRows', () => {
  it('returns everything when nothing is typed and no filter is chosen', () => {
    expect(names(filterCoverageRows(ROWS, { query: '', status: 'all' }))).toEqual([
      'Adobo',
      'Bicol Express',
      'Chicken Adobo Rice',
    ])
  })

  it('narrows to dishes still needing a recipe', () => {
    expect(names(filterCoverageRows(ROWS, { query: '', status: 'needs-recipe' }))).toEqual([
      'Bicol Express',
      'Chicken Adobo Rice',
    ])
  })

  it('narrows to dishes already set up', () => {
    expect(names(filterCoverageRows(ROWS, { query: '', status: 'has-recipe' }))).toEqual(['Adobo'])
  })

  it('matches a search anywhere in the name, not only at the start', () => {
    // "adobo" should find "Chicken Adobo Rice" — a merchant searches for the
    // word they remember, not the first word on the label.
    expect(names(filterCoverageRows(ROWS, { query: 'adobo', status: 'all' }))).toEqual([
      'Adobo',
      'Chicken Adobo Rice',
    ])
  })

  it('ignores case and surrounding whitespace', () => {
    expect(names(filterCoverageRows(ROWS, { query: '  BICOL ', status: 'all' }))).toEqual([
      'Bicol Express',
    ])
  })

  it('applies the search and the filter together', () => {
    expect(names(filterCoverageRows(ROWS, { query: 'adobo', status: 'needs-recipe' }))).toEqual([
      'Chicken Adobo Rice',
    ])
  })

  it('returns nothing when a search matches no dish', () => {
    expect(filterCoverageRows(ROWS, { query: 'pizza', status: 'all' })).toEqual([])
  })

  it('preserves the incoming order rather than re-sorting', () => {
    // `buildRecipeCoverage` already put the actionable dishes first. Re-sorting
    // here would silently override that decision.
    const reversed = [...ROWS].reverse()

    expect(names(filterCoverageRows(reversed, { query: '', status: 'all' }))).toEqual([
      'Chicken Adobo Rice',
      'Bicol Express',
      'Adobo',
    ])
  })
})

describe('countByStatus', () => {
  it('counts each filter so the chips can show totals', () => {
    expect(countByStatus(ROWS)).toEqual({ all: 3, 'needs-recipe': 2, 'has-recipe': 1 })
  })

  it('counts an empty menu as zero everywhere', () => {
    expect(countByStatus([])).toEqual({ all: 0, 'needs-recipe': 0, 'has-recipe': 0 })
  })
})

describe('COVERAGE_FILTERS', () => {
  it('leads with every dish, then the ones needing work', () => {
    // Order is the tab order a merchant reads left to right.
    expect(COVERAGE_FILTERS.map((f) => f.value)).toEqual(['all', 'needs-recipe', 'has-recipe'])
  })

  it('labels each filter', () => {
    const labels = COVERAGE_FILTERS.map((f: { value: CoverageFilter; label: string }) => f.label)
    expect(labels).toEqual(['All dishes', 'Needs recipe', 'Set up'])
  })
})
