import {
  EMPTY_RECIPE_LINE,
  createEmptyRecipeLine,
  buildRecipeInput,
  recipeFormFromData,
  estimateRecipeCost,
  type RecipeFormState,
} from '@/lib/inventory/recipe-form'
import type { InventoryItem, InventoryUnitRow, RecipeComponent, Recipe } from '@/types/database'

const GRAM: InventoryUnitRow = {
  id: 'g', tenant_id: 't', name: 'Gram', abbreviation: 'g', dimension: 'weight',
  to_base_factor: 1, is_base: true, is_active: true, created_at: '', updated_at: '',
}
const KILO: InventoryUnitRow = {
  id: 'kg', tenant_id: 't', name: 'Kilogram', abbreviation: 'kg', dimension: 'weight',
  to_base_factor: 1000, is_base: false, is_active: true, created_at: '', updated_at: '',
}
const FLOUR: InventoryItem = {
  id: 'flour', tenant_id: 't', name: 'Flour', sku: null, category: null,
  stock_unit_id: 'g', unit_cost: 0.02, is_prep: false, image_url: null,
  current_qty: 0, reorder_level: 0, is_active: true, created_at: '', updated_at: '',
}

const line = (over: Partial<RecipeFormState['lines'][number]>) => ({ ...EMPTY_RECIPE_LINE, ...over })

const UUID_FLOUR = '11111111-1111-4111-8111-111111111111'
const UUID_GRAM = '22222222-2222-4222-8222-222222222222'

describe('buildRecipeInput', () => {
  it('drops fully-blank trailing lines and coerces quantity', () => {
    const form: RecipeFormState = {
      notes: '  house blend ',
      lines: [
        line({ inventory_item_id: UUID_FLOUR, quantity: '250', unit_id: UUID_GRAM }),
        line({}), // blank trailing row
      ],
    }
    const input = buildRecipeInput(form)
    expect(input.notes).toBe('house blend')
    expect(input.components).toEqual([
      { inventory_item_id: UUID_FLOUR, quantity: 250, unit_id: UUID_GRAM },
    ])
  })

  it('maps blank notes to null', () => {
    const input = buildRecipeInput({ notes: '   ', lines: [] })
    expect(input.notes).toBeNull()
    expect(input.components).toEqual([])
  })

  it('rejects a line with a chosen ingredient but no unit', () => {
    const form: RecipeFormState = {
      notes: '',
      lines: [line({ inventory_item_id: 'flour', quantity: '1', unit_id: '' })],
    }
    expect(() => buildRecipeInput(form)).toThrow('A unit is required')
  })

  it('treats blank quantity on a filled line as zero', () => {
    const form: RecipeFormState = {
      notes: '',
      lines: [line({ inventory_item_id: UUID_FLOUR, quantity: '', unit_id: UUID_GRAM })],
    }
    expect(buildRecipeInput(form).components[0].quantity).toBe(0)
  })
})

describe('recipeFormFromData', () => {
  it('returns a single blank line when there is no recipe yet', () => {
    const form = recipeFormFromData(null)
    expect(form.notes).toBe('')
    // `uid` is the editor's own list identity and never reaches the server, so
    // the shape is asserted without it.
    expect(form.lines).toEqual([expect.objectContaining(EMPTY_RECIPE_LINE)])
    expect(form.lines[0].uid).toEqual(expect.any(String))
  })

  it('round-trips an existing recipe into editable string lines', () => {
    const recipe = { id: 'r1', notes: 'keep cold' } as Recipe
    const components: RecipeComponent[] = [
      {
        id: 'c1', tenant_id: 't', recipe_id: 'r1', inventory_item_id: 'flour',
        quantity: 250, unit_id: 'g', sort_order: 0, created_at: '', updated_at: '',
      },
    ]
    const form = recipeFormFromData({ recipe, components })
    expect(form.notes).toBe('keep cold')
    expect(form.lines).toEqual([
      expect.objectContaining({ inventory_item_id: 'flour', quantity: '250', unit_id: 'g' }),
    ])
  })
})

describe('estimateRecipeCost', () => {
  it('sums quantity converted to the ingredient stock unit times unit cost', () => {
    // 0.5 kg flour = 500 g × ₱0.02/g = ₱10.00
    const lines = [line({ inventory_item_id: 'flour', quantity: '0.5', unit_id: 'kg' })]
    const cost = estimateRecipeCost(lines, [FLOUR], [GRAM, KILO])
    expect(cost).toBeCloseTo(10, 5)
  })

  it('ignores lines whose ingredient or unit is unknown', () => {
    const lines = [line({ inventory_item_id: 'ghost', quantity: '5', unit_id: 'g' })]
    expect(estimateRecipeCost(lines, [FLOUR], [GRAM, KILO])).toBe(0)
  })

  it('returns 0 for an all-blank form without throwing', () => {
    expect(estimateRecipeCost([EMPTY_RECIPE_LINE], [FLOUR], [GRAM, KILO])).toBe(0)
  })
})

// ── Phase 3: prep yields ─────────────────────────────────────────────────────

describe('recipe form yields', () => {
  it('carries a prep yield into the service input', () => {
    // Arrange
    const form: RecipeFormState = {
      notes: '',
      lines: [line({ inventory_item_id: UUID_FLOUR, quantity: '1000', unit_id: UUID_GRAM })],
      yieldQuantity: '900',
      yieldUnitId: UUID_GRAM,
    }

    // Act
    const input = buildRecipeInput(form)

    // Assert — 1000g of flour yielding 900g of dough is the whole point of a
    // prep: the loss is what makes the derived unit cost differ from the sum.
    expect(input.yield_quantity).toBe(900)
    expect(input.yield_unit_id).toBe(UUID_GRAM)
  })

  it('omits the yield when the merchant left it blank', () => {
    const form: RecipeFormState = {
      notes: '',
      lines: [line({ inventory_item_id: UUID_FLOUR, quantity: '10', unit_id: UUID_GRAM })],
      yieldQuantity: '',
      yieldUnitId: '',
    }

    const input = buildRecipeInput(form)

    expect(input.yield_quantity).toBeUndefined()
    expect(input.yield_unit_id).toBeUndefined()
  })

  it('round-trips a saved yield back into the form', () => {
    const recipe = {
      id: 'r1', tenant_id: 't', target_type: 'prep_item' as const, prep_item_id: 'dough',
      yield_quantity: 900, yield_unit_id: UUID_GRAM, notes: null, created_at: '', updated_at: '',
    } as Recipe

    const form = recipeFormFromData({
      recipe,
      components: [
        { id: 'c1', tenant_id: 't', recipe_id: 'r1', inventory_item_id: UUID_FLOUR,
          quantity: 1000, unit_id: UUID_GRAM, sort_order: 0, created_at: '' } as RecipeComponent,
      ],
    })

    expect(form.yieldQuantity).toBe('900')
    expect(form.yieldUnitId).toBe(UUID_GRAM)
  })

  it('leaves the yield blank for a recipe that has none', () => {
    const form = recipeFormFromData(null)

    expect(form.yieldQuantity).toBe('')
    expect(form.yieldUnitId).toBe('')
  })
})

describe('line identity', () => {
  it('gives every new blank line an identity of its own', () => {
    // Keyed by index, removing the second of four lines re-keys every line
    // below it and carries typed values up into the wrong rows.
    const a = createEmptyRecipeLine()
    const b = createEmptyRecipeLine()

    expect(a.uid).not.toEqual(b.uid)
  })

  it('keeps identities distinct across a loaded recipe', () => {
    const recipe = { id: 'r1', notes: null } as Recipe
    const components: RecipeComponent[] = [0, 1, 2].map((i) => ({
      id: `c${i}`, tenant_id: 't', recipe_id: 'r1', inventory_item_id: 'flour',
      quantity: 1, unit_id: 'g', sort_order: i, created_at: '', updated_at: '',
    }))

    const uids = recipeFormFromData({ recipe, components }).lines.map((l) => l.uid)

    expect(new Set(uids).size).toBe(3)
  })

  it('never sends the identity to the server', () => {
    const input = buildRecipeInput({
      notes: '',
      lines: [
        {
          ...createEmptyRecipeLine(),
          inventory_item_id: '11111111-1111-4111-8111-111111111111',
          quantity: '2',
          unit_id: '22222222-2222-4222-8222-222222222222',
        },
      ],
    })

    expect(input.components[0]).not.toHaveProperty('uid')
  })
})
