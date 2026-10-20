/**
 * The web ingredient editor sends only what the account may change (Phase 0d
 * code review M1). It used to resend the price and reorder level it loaded:
 * after a priced delivery re-blended the cost, a Menu-only rename carried the
 * OLD price, the server saw a changed price, and refused a cost the person
 * never touched and could not see.
 */
import { ingredientUpdateForCaller } from '@/lib/inventory/inventory-form'

const input = {
  name: 'Beef',
  sku: null,
  category: 'Meat',
  stock_unit_id: 'kg',
  unit_cost: 420,
  is_prep: false,
  image_url: null,
  reorder_level: 5,
  is_active: true,
}

describe('ingredientUpdateForCaller', () => {
  it('leaves the price out without costs and the reorder level out without inventory', () => {
    const update = ingredientUpdateForCaller(input, { canSeeCosts: false, canManageStock: false })
    expect(update).not.toHaveProperty('unit_cost')
    expect(update).not.toHaveProperty('reorder_level')
    expect(update.name).toBe('Beef')
  })

  it('sends both to an account holding both', () => {
    expect(ingredientUpdateForCaller(input, { canSeeCosts: true, canManageStock: true })).toEqual(input)
  })

  it('never changes the input it was given', () => {
    ingredientUpdateForCaller(input, { canSeeCosts: false, canManageStock: false })
    expect(input.unit_cost).toBe(420)
  })
})
