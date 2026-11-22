import { costOfLines } from '@/lib/inventory/dish-recipe/cost'
import { UNITS } from './dish-recipe-fixtures'

describe('costOfLines', () => {
  const ingredients = new Map([
    ['milk', { stock_unit_id: 'l', unit_cost: '90' }],
    ['tea', { stock_unit_id: 'g', unit_cost: 0.5 }],
    ['cup', { stock_unit_id: 'pc', unit_cost: null }],
  ])

  it('converts to the stock unit and prices each line', () => {
    const cost = costOfLines(
      [
        { inventoryItemId: 'milk', quantity: 250, unitId: 'ml' },
        { inventoryItemId: 'tea', quantity: 8, unitId: 'g' },
      ],
      ingredients,
      UNITS,
    )
    expect(cost).toEqual({ pesos: 26.5, isPartial: false })
  })

  it('says the figure is partial when a line has no price or an unknown ingredient', () => {
    const cost = costOfLines(
      [
        { inventoryItemId: 'tea', quantity: 2, unitId: 'g' },
        { inventoryItemId: 'cup', quantity: 1, unitId: 'pc' },
        { inventoryItemId: 'gone', quantity: 1, unitId: 'pc' },
      ],
      ingredients,
      UNITS,
    )
    expect(cost).toEqual({ pesos: 1, isPartial: true })
  })
})
