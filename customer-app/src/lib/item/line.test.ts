import { VALID_CATALOG } from '@/fixtures/contract-fixtures'
import type { AppMenuItem } from '@/lib/contract'
import { defaultSelections } from '@/lib/cart/pricing'
import { buildCartLine } from './line'

const latte = VALID_CATALOG.items.find((item) => item.id === 'item-latte') as AppMenuItem

describe('buildCartLine', () => {
  it('freezes the unit price and labels of the picks', () => {
    const selections = { ...defaultSelections(latte), size: { grande: 1 }, extras: { shot: 2 } }
    const line = buildCartLine(latte, selections, 3, 'line-1')
    expect(line).toEqual({
      lineId: 'line-1',
      itemId: 'item-latte',
      name: 'Caffè Latte',
      imageUrl: latte.imageUrl,
      selections,
      optionLabels: ['Grande 16oz', 'Whole milk', '2× Extra espresso shot'],
      quantity: 3,
      unitCentavos: 14500 + 2000 + 2 * 3500,
    })
  })

  it('keeps the quantity inside 1–99', () => {
    expect(buildCartLine(latte, defaultSelections(latte), 0, 'a').quantity).toBe(1)
    expect(buildCartLine(latte, defaultSelections(latte), 500, 'b').quantity).toBe(99)
  })
})
