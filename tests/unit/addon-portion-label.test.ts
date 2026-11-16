import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ADDON_PORTION_LABEL, addonLabel, parseAddonLabel } from '@/lib/addon-quantity'
import { describeOrderItem } from '@/lib/order-item-display'

/**
 * One reader for the `Name ×N` add-on label that addonLabel writes. The web's
 * two former copies (order-item-display, order-line-modifier-pricing) now call
 * parseAddonLabel; the merchant app keeps its own constant (separate package)
 * and this test pins it to the web's byte for byte.
 */
describe('parseAddonLabel', () => {
  it.each([
    ['Kimchi ×2', 'Kimchi', 2],
    ['Kimchi×3', 'Kimchi', 3],
    ['  Extra rice ×12  ', 'Extra rice', 12],
    ['Wings Box 6', 'Wings Box 6', 1],
    ['Coke x2', 'Coke x2', 1],
    ['Fries × 2', 'Fries × 2', 1],
    ['×2', '×2', 1],
    ['Plain', 'Plain', 1],
    ['Sauce  ×2', 'Sauce', 2],
    ['Half ×2 ×3', 'Half ×2', 3],
  ])('%j → %j × %d', (label, name, portions) => {
    expect(parseAddonLabel(label)).toEqual({ name, portions })
  })

  it('reads back every label addonLabel writes', () => {
    for (const quantity of [undefined, 1, 2, 5, 99]) {
      const written = addonLabel({ name: 'Garlic Rice', quantity } as never)
      expect(parseAddonLabel(written)).toEqual({ name: 'Garlic Rice', portions: quantity && quantity > 1 ? quantity : 1 })
    }
  })

  it('describeOrderItem still turns labels into add-on rows the same way', () => {
    const view = describeOrderItem({ quantity: 1, price: 100, subtotal: 100, addons: ['Kimchi ×2', 'Coke x2'] })
    expect(view.addons.map((addon) => [addon.name, addon.quantity])).toEqual([['Kimchi', 2], ['Coke x2', 1]])
  })

  it("the merchant app's pattern is the web's, byte for byte", () => {
    const app = readFileSync(join(process.cwd(), 'webnegosyo-app/lib/order-edit-cart.ts'), 'utf8')
    const match = /export const ADDON_PORTION_LABEL = \/(.+)\/;/.exec(app)
    expect(match?.[1]).toBe(ADDON_PORTION_LABEL.source)
  })
})
