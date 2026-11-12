import { VALID_CATALOG } from '@/fixtures/contract-fixtures'
import type { AppCatalog } from '@/lib/contract'
import { MAX_PAIRINGS, pairingsFor } from './pairings'

const catalog = VALID_CATALOG as unknown as AppCatalog
const ids = (items: { id: string }[]) => items.map((item) => item.id)

describe('pairingsFor', () => {
  it("uses the merchant's pairings for the dish, in their order", () => {
    expect(ids(pairingsFor(catalog, 'item-latte', []))).toEqual(['item-croissant', 'item-ensaymada'])
  })

  it('drops pairings already in the bag and sold-out ones', () => {
    const soldOut: AppCatalog = {
      ...catalog,
      items: catalog.items.map((item) => (item.id === 'item-ensaymada' ? { ...item, isAvailable: false } : item)),
    }
    // Nothing of the merchant's list is left, so it falls back to featured dishes (minus the latte itself).
    expect(ids(pairingsFor(soldOut, 'item-latte', ['item-croissant']))).toEqual(['item-sea-salt', 'item-cold-brew'])
  })

  it('keeps what is left of the merchant list when only some pairings drop out', () => {
    expect(ids(pairingsFor(catalog, 'item-latte', ['item-croissant']))).toEqual(['item-ensaymada'])
  })

  it('falls back to featured dishes, never the dish itself or anything in the bag', () => {
    const picks = ids(pairingsFor(catalog, 'item-americano', ['item-sea-salt']))
    expect(picks).toEqual(['item-latte', 'item-cold-brew'])
  })

  it('ignores pairing targets that are no longer on the menu', () => {
    const stale: AppCatalog = { ...catalog, pairings: [{ sourceItemId: 'item-latte', targetItemIds: ['gone', 'item-croissant'] }] }
    expect(ids(pairingsFor(stale, 'item-latte', []))).toEqual(['item-croissant'])
  })

  it('never returns more than the cap', () => {
    const many: AppCatalog = {
      ...catalog,
      pairings: [{ sourceItemId: 'item-latte', targetItemIds: catalog.items.map((item) => item.id) }],
    }
    expect(pairingsFor(many, 'item-latte', []).length).toBeLessThanOrEqual(MAX_PAIRINGS)
  })
})
