import {
  EMPTY_INGREDIENT_DRAFT,
  EMPTY_UNIT_DRAFT,
  buildIngredientInput,
  buildUnitInput,
  ingredientToDraft,
  unitToDraft,
  type IngredientDraft,
  type UnitDraft,
} from '@/lib/inventory/inventory-form'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

describe('buildIngredientInput', () => {
  const base: IngredientDraft = {
    ...EMPTY_INGREDIENT_DRAFT,
    name: '  Flour  ',
    stock_unit_id: '11111111-1111-4111-8111-111111111111',
    unit_cost: '2.50',
    reorder_level: '10',
  }

  it('trims the name and coerces numeric strings to numbers', () => {
    const input = buildIngredientInput(base)
    expect(input.name).toBe('Flour')
    expect(input.unit_cost).toBe(2.5)
    expect(input.reorder_level).toBe(10)
  })

  it('maps blank sku and category to null rather than empty string', () => {
    const input = buildIngredientInput({ ...base, sku: '', category: '   ' })
    expect(input.sku).toBeNull()
    expect(input.category).toBeNull()
  })

  it('treats blank cost and reorder level as zero', () => {
    const input = buildIngredientInput({ ...base, unit_cost: '', reorder_level: '' })
    expect(input.unit_cost).toBe(0)
    expect(input.reorder_level).toBe(0)
  })

  it('passes through the is_prep and is_active flags', () => {
    const input = buildIngredientInput({ ...base, is_prep: true, is_active: false })
    expect(input.is_prep).toBe(true)
    expect(input.is_active).toBe(false)
  })

  it('throws a friendly error when the name is empty', () => {
    expect(() => buildIngredientInput({ ...base, name: '   ' })).toThrow('Name is required')
  })

  it('throws a friendly error when no stock unit is chosen', () => {
    expect(() => buildIngredientInput({ ...base, stock_unit_id: '' })).toThrow(
      'A stock unit is required',
    )
  })

  it('rejects a negative unit cost', () => {
    expect(() => buildIngredientInput({ ...base, unit_cost: '-1' })).toThrow(
      'Unit cost cannot be negative',
    )
  })
})

describe('ingredientToDraft', () => {
  it('round-trips an existing ingredient into editable string fields', () => {
    const item: InventoryItem = {
      id: 'i1',
      tenant_id: 't1',
      name: 'Sugar',
      sku: 'SKU-1',
      category: 'Dry',
      stock_unit_id: 'u1',
      unit_cost: 1.25,
      is_prep: false,
      image_url: null,
      current_qty: 0,
      reorder_level: 5,
      is_active: true,
      created_at: '',
      updated_at: '',
    }
    const draft = ingredientToDraft(item)
    expect(draft).toEqual({
      name: 'Sugar',
      sku: 'SKU-1',
      category: 'Dry',
      stock_unit_id: 'u1',
      unit_cost: '1.25',
      reorder_level: '5',
      is_prep: false,
      is_active: true,
    })
  })
})

describe('buildUnitInput', () => {
  const base: UnitDraft = {
    ...EMPTY_UNIT_DRAFT,
    name: '  Gram ',
    abbreviation: ' g ',
    dimension: 'weight',
    to_base_factor: '1',
  }

  it('trims text and coerces the conversion factor', () => {
    const input = buildUnitInput(base)
    expect(input.name).toBe('Gram')
    expect(input.abbreviation).toBe('g')
    expect(input.to_base_factor).toBe(1)
  })

  it('throws when the conversion factor is zero or negative', () => {
    expect(() => buildUnitInput({ ...base, to_base_factor: '0' })).toThrow(
      'Conversion factor must be greater than zero',
    )
  })
})

describe('unitToDraft', () => {
  it('round-trips a unit row into editable string fields', () => {
    const row: InventoryUnitRow = {
      id: 'u1',
      tenant_id: 't1',
      name: 'Kilogram',
      abbreviation: 'kg',
      dimension: 'weight',
      to_base_factor: 1000,
      is_base: false,
      is_active: true,
      created_at: '',
      updated_at: '',
    }
    const draft = unitToDraft(row)
    expect(draft.name).toBe('Kilogram')
    expect(draft.abbreviation).toBe('kg')
    expect(draft.dimension).toBe('weight')
    expect(draft.to_base_factor).toBe('1000')
  })
})
