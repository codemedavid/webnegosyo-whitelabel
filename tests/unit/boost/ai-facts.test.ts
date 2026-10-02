import { buildBoostAiFacts, MAX_FACT_ITEMS, type AiFactItem } from '@/lib/boost/ai/facts'

function item(id: string, orders: number, overrides: Partial<AiFactItem> = {}): AiFactItem {
  return { id, name: id.toUpperCase(), price: 100, categoryName: 'Mains', role: 'main', orders, isAvailable: true, ...overrides }
}

describe('buildBoostAiFacts', () => {
  it('gives best sellers the first short refs and leaves out unavailable dishes', () => {
    // Arrange
    const items = [item('a', 1), item('b', 9), item('c', 5, { isAvailable: false })]

    // Act
    const { payload, refToId } = buildBoostAiFacts({
      items,
      pairs: [],
      orderCount: 10,
      windowLabel: 'last 90 days',
      existing: { combos: [], upgrades: [], pairingSourceIds: [], lastCallEnabled: false },
    })

    // Assert
    expect(refToId).toEqual({ i1: 'b', i2: 'a' })
    expect(payload.items.map((i) => i.ref)).toEqual(['i1', 'i2'])
    expect(payload.orders).toEqual({ count: 10, window: 'last 90 days' })
  })

  it('never sends a UUID: pairs and existing offers are rewritten as refs, unknown ids dropped', () => {
    const { payload } = buildBoostAiFacts({
      items: [item('burger', 4), item('fries', 4)],
      pairs: [
        { anchorId: 'burger', partnerId: 'fries', together: 4, share: 1, reverseShare: 0.5, support: 0.4, lift: 2.5, strength: 'always' },
        { anchorId: 'burger', partnerId: 'gone', together: 3, share: 0.7, reverseShare: 1, support: 0.3, lift: 2, strength: 'always' },
      ],
      orderCount: 10,
      windowLabel: 'last 90 days',
      existing: {
        combos: [['burger', 'fries'], ['gone']],
        upgrades: [{ sourceId: 'burger', targetId: 'gone' }],
        pairingSourceIds: ['fries'],
        lastCallEnabled: true,
      },
    })

    expect(payload.pickedTogether).toEqual([{ a: 'i1', b: 'i2', together: 4, aShare: 100, bShare: 50, lift: 2.5 }])
    expect(payload.existing).toEqual({ combos: [['i1', 'i2']], upgrades: [], pairedItems: ['i2'], lastCallOn: true })
  })

  it('caps a huge menu', () => {
    const items = Array.from({ length: MAX_FACT_ITEMS + 20 }, (_, i) => item(`x${i}`, i))

    const { payload } = buildBoostAiFacts({
      items,
      pairs: [],
      orderCount: 0,
      windowLabel: 'no orders yet',
      existing: { combos: [], upgrades: [], pairingSourceIds: [], lastCallEnabled: false },
    })

    expect(payload.items).toHaveLength(MAX_FACT_ITEMS)
  })
})
