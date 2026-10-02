import { addLine, cartSummary, lineKey, MAX_LINE_QUANTITY, updateQuantity, type CartLine } from './cart'

const line = (overrides: Partial<CartLine> = {}): CartLine => ({
  lineId: 'a',
  itemId: 'item-latte',
  name: 'Caffè Latte',
  imageUrl: null,
  selections: { size: { tall: 1 } },
  optionLabels: ['Tall 12oz'],
  quantity: 1,
  unitCentavos: 14500,
  ...overrides,
})

describe('lineKey', () => {
  it('ignores key order and empty groups', () => {
    expect(lineKey('x', { b: { two: 1 }, a: { one: 2 }, c: {} })).toBe(lineKey('x', { a: { one: 2 }, b: { two: 1 } }))
  })
})

describe('addLine', () => {
  it('merges an identical item + selections into one line', () => {
    const lines = addLine([line()], line({ lineId: 'b', quantity: 2 }))
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(3)
  })

  it('keeps a differently customised item as its own line', () => {
    const lines = addLine([line()], line({ lineId: 'b', selections: { size: { venti: 1 } } }))
    expect(lines.map((entry) => entry.lineId)).toEqual(['a', 'b'])
  })

  it('caps a merged quantity and never mutates the input', () => {
    const before = [line({ quantity: MAX_LINE_QUANTITY - 1 })]
    const after = addLine(before, line({ lineId: 'b', quantity: 5 }))
    expect(after[0].quantity).toBe(MAX_LINE_QUANTITY)
    expect(before[0].quantity).toBe(MAX_LINE_QUANTITY - 1)
  })
})

describe('updateQuantity', () => {
  it('removes a line at zero', () => {
    expect(updateQuantity([line()], 'a', 0)).toEqual([])
  })

  it('changes only the addressed line', () => {
    const lines = updateQuantity([line(), line({ lineId: 'b', itemId: 'y' })], 'b', 4)
    expect(lines.map((entry) => entry.quantity)).toEqual([1, 4])
  })
})

describe('cartSummary', () => {
  it('counts units and sums in centavos', () => {
    const summary = cartSummary([line({ quantity: 2 }), line({ lineId: 'b', itemId: 'y', unitCentavos: 9550 })])
    expect(summary).toEqual({ itemCount: 3, subtotalCentavos: 38550 })
  })
})
