/**
 * "Is this thing actually doing anything?"
 *
 * Inventory can be switched on and still be inert — no recipes, no reorder
 * levels, alerts off, auto-86 off. Every one of those looks identical from the
 * merchant's chair: stock sits still and nothing ever happens. The first tenant
 * to enable inventory had one ingredient, zero recipes, and no way to find that
 * out.
 *
 * A gap here is not a warning about the future. It is a statement that a part of
 * the system currently cannot fire, and the reason why.
 */

import { summarizeInventoryHealth } from '@/lib/inventory/inventory-health'
import type { StockLevelInput } from '@/lib/inventory/low-stock'
import type { RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'

function ingredient(over: Partial<StockLevelInput> & { id: string }): StockLevelInput {
  return { name: over.id, current_qty: 100, reorder_level: 10, is_active: true, ...over }
}

const COVERED: RecipeCoverageRow = {
  menuItemId: 'm1',
  name: 'Adobo',
  hasRecipe: true,
  ingredientCount: 2,
}
const UNCOVERED: RecipeCoverageRow = {
  menuItemId: 'm2',
  name: 'Sinigang',
  hasRecipe: false,
  ingredientCount: 0,
}

const ALL_ON = { lowStockAlertsEnabled: true, auto86Enabled: true }

function summarize(over: Parameters<typeof summarizeInventoryHealth>[0]) {
  return summarizeInventoryHealth(over)
}

describe('counting what is on the shelf', () => {
  it('splits ingredients into ok, low and out', () => {
    const health = summarize({
      ingredients: [
        ingredient({ id: 'a', current_qty: 100, reorder_level: 10 }),
        ingredient({ id: 'b', current_qty: 5, reorder_level: 10 }),
        ingredient({ id: 'c', current_qty: 0 }),
      ],
      coverage: [COVERED],
      autoHiddenCount: 0,
      flags: ALL_ON,
    })

    expect(health.ingredients).toEqual({ total: 3, ok: 1, low: 1, out: 1 })
  })

  it('leaves archived ingredients out of every count', () => {
    const health = summarize({
      ingredients: [
        ingredient({ id: 'a' }),
        ingredient({ id: 'archived', current_qty: 0, is_active: false }),
      ],
      coverage: [COVERED],
      autoHiddenCount: 0,
      flags: ALL_ON,
    })

    expect(health.ingredients).toEqual({ total: 1, ok: 1, low: 0, out: 0 })
  })

  it('counts dishes with a recipe and dishes the system hid', () => {
    const health = summarize({
      ingredients: [ingredient({ id: 'a' })],
      coverage: [COVERED, UNCOVERED],
      autoHiddenCount: 3,
      flags: ALL_ON,
    })

    expect(health.dishes).toEqual({ total: 2, withRecipe: 1, autoHidden: 3 })
  })
})

describe('naming the reasons nothing is happening', () => {
  it('reports a clean setup as having no gaps', () => {
    const health = summarize({
      ingredients: [ingredient({ id: 'a' })],
      coverage: [COVERED],
      autoHiddenCount: 0,
      flags: ALL_ON,
    })

    expect(health.gaps).toEqual([])
  })

  it('reports an empty shelf as the gap that blocks everything else', () => {
    const health = summarize({
      ingredients: [],
      coverage: [COVERED],
      autoHiddenCount: 0,
      flags: ALL_ON,
    })

    // With nothing to deduct, no recipe and no threshold can matter yet, so
    // listing them too would bury the one thing to do first.
    expect(health.gaps.map((g) => g.id)).toEqual(['no-ingredients'])
  })

  it('reports that no dish has a recipe, so no sale will ever move stock', () => {
    const health = summarize({
      ingredients: [ingredient({ id: 'a' })],
      coverage: [UNCOVERED],
      autoHiddenCount: 0,
      flags: ALL_ON,
    })

    expect(health.gaps.map((g) => g.id)).toContain('no-recipes')
  })

  it('does not report the recipe gap once a single dish is set up', () => {
    const health = summarize({
      ingredients: [ingredient({ id: 'a' })],
      coverage: [COVERED, UNCOVERED],
      autoHiddenCount: 0,
      flags: ALL_ON,
    })

    expect(health.gaps.map((g) => g.id)).not.toContain('no-recipes')
  })

  it('reports that no ingredient has a reorder level, so low stock can never fire', () => {
    const health = summarize({
      ingredients: [ingredient({ id: 'a', reorder_level: 0 })],
      coverage: [COVERED],
      autoHiddenCount: 0,
      flags: ALL_ON,
    })

    expect(health.gaps.map((g) => g.id)).toContain('no-reorder-levels')
  })

  it('reports low-stock alerts being switched off', () => {
    const health = summarize({
      ingredients: [ingredient({ id: 'a' })],
      coverage: [COVERED],
      autoHiddenCount: 0,
      flags: { lowStockAlertsEnabled: false, auto86Enabled: true },
    })

    expect(health.gaps.map((g) => g.id)).toContain('alerts-off')
  })

  it('reports auto-86 being switched off', () => {
    const health = summarize({
      ingredients: [ingredient({ id: 'a' })],
      coverage: [COVERED],
      autoHiddenCount: 0,
      flags: { lowStockAlertsEnabled: true, auto86Enabled: false },
    })

    expect(health.gaps.map((g) => g.id)).toContain('auto-86-off')
  })

  it('gives every gap a title and an explanation a merchant can act on', () => {
    const health = summarize({
      ingredients: [],
      coverage: [],
      autoHiddenCount: 0,
      flags: { lowStockAlertsEnabled: false, auto86Enabled: false },
    })

    for (const gap of health.gaps) {
      expect(gap.title.length).toBeGreaterThan(0)
      expect(gap.detail.length).toBeGreaterThan(0)
    }
  })
})
