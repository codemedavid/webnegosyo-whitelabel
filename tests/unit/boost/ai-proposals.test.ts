import { normalizeAiProposals, type ProposalContext, type ProposalItem } from '@/lib/boost/ai/proposals'
import type { ComboIdea, LastCallIdea, PairingIdea, UpgradeIdea } from '@/lib/boost/ideas'

const ITEMS: ProposalItem[] = [
  { id: 'burger', name: 'Burger', price: 120, categoryName: 'Burgers', isAvailable: true },
  { id: 'burger-meal', name: 'Burger Meal', price: 180, categoryName: 'Burgers', isAvailable: true },
  { id: 'cheese', name: 'Cheese Burger', price: 140, categoryName: 'Burgers', isAvailable: true },
  { id: 'fries', name: 'Fries', price: 60, categoryName: 'Sides', isAvailable: true },
  { id: 'coke', name: 'Coke', price: 45, categoryName: 'Drinks', isAvailable: true },
  { id: 'tea', name: 'Iced Tea', price: 40, categoryName: 'Drinks', isAvailable: true },
  { id: 'sold-out', name: 'Halo-halo', price: 90, categoryName: 'Desserts', isAvailable: false },
]

function context(overrides: Partial<ProposalContext['existing']> = {}): ProposalContext {
  return {
    items: new Map(ITEMS.map((item) => [item.id, item])),
    refToId: { i1: 'burger', i2: 'burger-meal', i3: 'cheese', i4: 'fries', i5: 'coke', i6: 'tea', i7: 'sold-out' },
    existing: {
      comboKeys: new Set(),
      upgradeSourceIds: new Set(),
      pairingSourceIds: new Set(),
      ...overrides,
    },
  }
}

describe('normalizeAiProposals — combos', () => {
  it('maps refs back to menu items and keeps a sane proposed price', () => {
    // Arrange
    const raw = {
      summary: 'Burgers sell with fries.',
      combos: [{
        name: 'Burger Fries Deal',
        reason: 'Fries are in 75% of burger orders',
        price: 199,
        picks: [{ label: 'Burger', items: ['i1'] }, { label: 'Side', items: ['i4'] }, { label: 'Drink', items: ['i5', 'i6'] }],
      }],
    }

    // Act
    const { summary, ideas } = normalizeAiProposals(raw, context())
    const combo = ideas[0] as ComboIdea

    // Assert: regular = 120 + 60 + min(45, 40)
    expect(summary).toBe('Burgers sell with fries.')
    expect(combo.kind).toBe('combo')
    expect(combo.picks).toEqual([
      { label: 'Burger', itemIds: ['burger'] },
      { label: 'Side', itemIds: ['fries'] },
      { label: 'Drink', itemIds: ['coke', 'tea'] },
    ])
    expect(combo.regularPrice).toBe(220)
    expect(combo.price).toBe(199)
    expect(combo.savings).toEqual({ amount: 21, percent: 10 })
  })

  it('replaces a price that saves nothing, or gives the store away, with a suggested one', () => {
    const picks = [{ label: 'Burger', items: ['i1'] }, { label: 'Side', items: ['i4'] }]
    const tooHigh = normalizeAiProposals({ combos: [{ name: 'A', picks, price: 500 }] }, context()).ideas[0] as ComboIdea
    const tooLow = normalizeAiProposals({ combos: [{ name: 'B', picks, price: 20 }] }, context()).ideas[0] as ComboIdea

    expect(tooHigh.price).toBeLessThan(180)
    expect(tooLow.price).toBeGreaterThanOrEqual(90)
  })

  it('drops combos of one item, unknown items, sold-out items and duplicates of live combos', () => {
    const raw = {
      combos: [
        { name: 'Solo', picks: [{ label: 'Burger', items: ['i1'] }] },
        { name: 'Ghost', picks: [{ label: 'X', items: ['i99'] }, { label: 'Y', items: ['nope'] }] },
        { name: 'Sold out', picks: [{ label: 'D', items: ['i7'] }, { label: 'E', items: ['i7'] }] },
        { name: 'Existing', picks: [{ label: 'Burger', items: ['i1'] }, { label: 'Side', items: ['i4'] }] },
      ],
    }

    const { ideas } = normalizeAiProposals(raw, context({ comboKeys: new Set(['burger|fries']) }))

    expect(ideas).toEqual([])
  })

  it('accepts "any 2" combos from one line with a count', () => {
    const raw = { combos: [{ name: 'Any 2 Drinks', picks: [{ label: 'Drink', items: ['i5', 'i6'], count: 2 }] }] }

    const combo = normalizeAiProposals(raw, context()).ideas[0] as ComboIdea

    expect(combo.picks).toEqual([{ label: 'Drink', itemIds: ['coke', 'tea'], count: 2 }])
    expect(combo.regularPrice).toBe(80)
  })

  it('resolves an exact dish name when the model ignores the refs', () => {
    const raw = { combos: [{ name: 'Named', picks: [{ label: 'Main', items: ['burger'] }, { label: 'Drink', items: ['Iced Tea'] }] }] }

    const combo = normalizeAiProposals(raw, context()).ideas[0] as ComboIdea

    expect(combo.picks.map((p) => p.itemIds)).toEqual([['burger'], ['tea']])
  })
})

describe('normalizeAiProposals — upgrades', () => {
  it('keeps an upgrade to a pricier item and computes the difference', () => {
    const raw = { upgrades: [{ from: 'i1', to: 'i2', header: 'Make it a meal?', reason: 'Meal adds fries and a drink' }] }

    const upgrade = normalizeAiProposals(raw, context()).ideas[0] as UpgradeIdea

    expect(upgrade).toMatchObject({ kind: 'upgrade', sourceId: 'burger', targetId: 'burger-meal', priceDifference: 60, header: 'Make it a meal?' })
  })

  it('refuses a downgrade, a self-upgrade, a second upgrade for one dish and an already-upgraded dish', () => {
    const raw = {
      upgrades: [
        { from: 'i2', to: 'i1' },
        { from: 'i1', to: 'i1' },
        { from: 'i3', to: 'i2' },
        { from: 'i3', to: 'i2' },
        { from: 'i4', to: 'i2' },
      ],
    }

    const { ideas } = normalizeAiProposals(raw, context({ upgradeSourceIds: new Set(['fries']) }))

    expect(ideas.map((i) => (i as UpgradeIdea).sourceId)).toEqual(['cheese'])
  })
})

describe('normalizeAiProposals — pairings', () => {
  it('names the pairing after the shared category and never suggests an item with itself', () => {
    const raw = { pairings: [{ after: ['i1', 'i3'], suggest: ['i4', 'i5', 'i1'], reason: 'Fries go with burgers' }] }

    const pairing = normalizeAiProposals(raw, context()).ideas[0] as PairingIdea

    expect(pairing).toMatchObject({
      kind: 'pairing',
      sourceIds: ['burger', 'cheese'],
      targetIds: ['fries', 'coke'],
      categoryName: 'Burgers',
    })
  })

  it('skips dishes that already have a pairing, and gives each dish only one', () => {
    const raw = {
      pairings: [
        { after: ['i1'], suggest: ['i4'] },
        { after: ['i1', 'i3'], suggest: ['i5'] },
      ],
    }

    const { ideas } = normalizeAiProposals(raw, context({ pairingSourceIds: new Set(['burger']) }))

    expect(ideas.map((i) => (i as PairingIdea).sourceIds)).toEqual([['cheese']])
  })
})

describe('normalizeAiProposals — last call and bad input', () => {
  it('carries the picked items and copy into the idea settings', () => {
    const raw = { lastCall: { title: 'Kulang pa?', subtitle: 'Add a drink', items: ['i5', 'i6', 'i7'], reason: 'Drinks are quick adds' } }

    const lastCall = normalizeAiProposals(raw, context()).ideas[0] as LastCallIdea

    expect(lastCall.settings).toEqual({ title: 'Kulang pa?', subtitle: 'Add a drink', pickedItemIds: ['coke', 'tea'] })
  })

  it('returns nothing, without throwing, for output that is not the expected shape', () => {
    expect(normalizeAiProposals(null, context())).toEqual({ summary: '', ideas: [] })
    expect(normalizeAiProposals('text', context())).toEqual({ summary: '', ideas: [] })
    expect(normalizeAiProposals({ combos: 'nope', upgrades: [42, null] }, context()).ideas).toEqual([])
  })

  it('caps how many of each kind one generation can propose', () => {
    const raw = {
      upgrades: [
        { from: 'i1', to: 'i2' }, { from: 'i3', to: 'i2' }, { from: 'i4', to: 'i2' },
        { from: 'i5', to: 'i2' }, { from: 'i6', to: 'i2' },
      ],
    }

    expect(normalizeAiProposals(raw, context()).ideas).toHaveLength(4)
  })
})
