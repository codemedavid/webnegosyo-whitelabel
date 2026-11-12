import { VALID_CATALOG, VALID_ORDER_DETAIL } from '@/fixtures/contract-fixtures'
import { appCatalogSchema, appOrderDetailSchema } from '@/lib/contract'
import { reorderContext, reorderLines, skippedNotice } from './reorder'

const catalog = appCatalogSchema.parse(VALID_CATALOG)
const order = appOrderDetailSchema.parse(VALID_ORDER_DETAIL)
let counter = 0
const makeId = () => `new-${(counter += 1)}`

describe('reorderLines', () => {
  beforeEach(() => (counter = 0))

  it('rebuilds each line at today’s price with the same picks', () => {
    const { lines, skipped } = reorderLines(order, catalog.items, makeId)
    expect(skipped).toEqual([])
    expect(lines[0]).toMatchObject({
      itemId: 'item-latte',
      quantity: 2,
      selections: { size: { grande: 1 }, milk: { oat: 1 } },
      optionLabels: ['Grande 16oz', 'Oat milk'],
      unitCentavos: 14500 + 2000 + 3000,
    })
    expect(lines[1]).toMatchObject({ itemId: 'item-croissant', quantity: 1, unitCentavos: 9500 })
    expect(lines.map((line) => line.lineId)).toEqual(['new-1', 'new-2'])
  })

  it('skips dishes that are gone or sold out', () => {
    const items = catalog.items
      .filter((item) => item.id !== 'item-croissant')
      .map((item) => (item.id === 'item-latte' ? { ...item, isAvailable: false } : item))
    const { lines, skipped } = reorderLines(order, items, makeId)
    expect(lines).toEqual([])
    expect(skipped).toEqual(['Caffè Latte', 'Butter Croissant'])
  })

  it('skips a line whose picks no longer fit the dish', () => {
    const changed = {
      ...order,
      lines: [{ ...order.lines[0], selections: { size: { gone: 1 }, milk: { oat: 1 } } }],
    }
    expect(reorderLines(changed, catalog.items, makeId).skipped).toEqual(['Caffè Latte'])
  })

  it('skips a line placed before picks were recorded', () => {
    const old = { ...order, lines: [{ ...order.lines[0], itemId: null, selections: undefined }] }
    expect(reorderLines(old, catalog.items, makeId).skipped).toEqual(['Caffè Latte'])
  })
})

describe('reorderContext', () => {
  const outlets = [
    { id: 'o-bgc', name: 'BGC High Street' },
    { id: 'o-mkt', name: 'Salcedo Village' },
  ]

  it('brings back the order’s own mode and branch', () => {
    expect(reorderContext({ orderKind: 'delivery', outletName: 'Salcedo Village' }, outlets)).toEqual({ mode: 'delivery', outletId: 'o-mkt' })
    expect(reorderContext({ orderKind: 'dine_in', outletName: null }, outlets)).toEqual({ mode: 'dineIn', outletId: null })
  })

  it('leaves the mode alone for kinds the app cannot order, and the branch when it is gone', () => {
    expect(reorderContext({ orderKind: 'grab', outletName: 'Closed Branch' }, outlets)).toEqual({ mode: null, outletId: null })
  })
})

describe('skippedNotice', () => {
  it('names what was left out, in plain words', () => {
    expect(skippedNotice([])).toBeNull()
    expect(skippedNotice(['Nitro Cold Brew'])).toBe('Nitro Cold Brew isn’t available, so we left it out.')
    expect(skippedNotice(['Nitro', 'Croissant'])).toBe('Nitro, Croissant aren’t available, so we left them out.')
  })
})
