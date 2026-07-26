/**
 * Phase 3 — prep (composite) ingredients.
 *
 * The costing core already resolves a prep ingredient recursively: cost of its
 * own recipe ÷ how much that recipe yields. But `buildCostingGraph` only takes
 * that branch when the recipe row carries `yield_quantity` AND `yield_unit_id`,
 * and nothing in the write path can populate either — `recipeInputSchema` has
 * no yield fields, so `saveRecipeForTarget` never writes them.
 *
 * The visible consequence: a merchant ticks "Prep item (made in-house)", builds
 * its recipe, and the cost silently stays whatever they typed by hand. The
 * recursion is dead code. These tests open the write path.
 */

import { recipeInputSchema } from '@/lib/inventory/schemas'
import { buildRecipeRowFields } from '@/lib/inventory/recipe-yield'

const UUID_GRAM = '22222222-2222-4222-8222-222222222222'

describe('recipeInputSchema yield fields', () => {
  it('accepts a yield so a prep recipe can say how much it makes', () => {
    // Arrange / Act
    const parsed = recipeInputSchema.parse({
      notes: null,
      components: [],
      yield_quantity: 500,
      yield_unit_id: UUID_GRAM,
    })

    // Assert
    expect(parsed.yield_quantity).toBe(500)
    expect(parsed.yield_unit_id).toBe(UUID_GRAM)
  })

  it('still accepts input with no yield at all, for every non-prep target', () => {
    const parsed = recipeInputSchema.parse({ notes: null, components: [] })

    expect(parsed.yield_quantity).toBeUndefined()
    expect(parsed.yield_unit_id).toBeUndefined()
  })

  it('rejects a zero or negative yield, which would divide the cost by nothing', () => {
    expect(() =>
      recipeInputSchema.parse({ components: [], yield_quantity: 0, yield_unit_id: UUID_GRAM }),
    ).toThrow()
    expect(() =>
      recipeInputSchema.parse({ components: [], yield_quantity: -5, yield_unit_id: UUID_GRAM }),
    ).toThrow()
  })

  it('rejects a yield unit that is not a real unit id', () => {
    expect(() =>
      recipeInputSchema.parse({ components: [], yield_quantity: 500, yield_unit_id: 'grams' }),
    ).toThrow()
  })
})

describe('buildRecipeRowFields', () => {
  it('carries the yield onto the recipe row', () => {
    const fields = buildRecipeRowFields({
      notes: 'batch of dough',
      components: [],
      yield_quantity: 500,
      yield_unit_id: UUID_GRAM,
    })

    expect(fields).toEqual({
      notes: 'batch of dough',
      yield_quantity: 500,
      yield_unit_id: UUID_GRAM,
    })
  })

  it('writes explicit nulls when no yield was given, so clearing a yield sticks', () => {
    // An omitted yield must overwrite a previously-saved one rather than being
    // skipped — otherwise a merchant can never undo a wrong yield.
    const fields = buildRecipeRowFields({ notes: null, components: [] })

    expect(fields).toEqual({ notes: null, yield_quantity: null, yield_unit_id: null })
  })

  it('normalizes a blank notes string to null', () => {
    expect(buildRecipeRowFields({ notes: '', components: [] }).notes).toBeNull()
  })
})
