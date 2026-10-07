/** @jest-environment node */
import type { BoostIdea } from '@/lib/boost/ideas'

function idea(kind: BoostIdea['kind'], id: string): BoostIdea {
  const base = { id, title: id, reason: '', itemIds: [] }
  switch (kind) {
    case 'combo':
      return { ...base, kind, name: id, picks: [], regularPrice: 0, price: 0, savings: null }
    case 'upgrade':
      return { ...base, kind, sourceId: 's', targetId: 't', header: '', priceDifference: 0 }
    case 'pairing':
      return { ...base, kind, sourceIds: [], targetIds: [], categoryName: '' }
    case 'last_call':
      return { ...base, kind }
  }
}

const POOL: BoostIdea[] = [
  idea('combo', 'c1'), idea('pairing', 'p1'), idea('upgrade', 'u1'), idea('last_call', 'l1'),
  idea('combo', 'c2'), idea('pairing', 'p2'), idea('upgrade', 'u2'),
  idea('combo', 'c3'), idea('pairing', 'p3'), idea('upgrade', 'u3'),
  idea('pairing', 'p4'), idea('upgrade', 'u4'),
]

async function load() {
  return import('@/lib/onboarding/boost-autopilot')
}

describe('selectLaunchIdeas', () => {
  it('keeps 2 combos, 3 upgrades, 3 pairings and the last call by default, in ranking order', async () => {
    const { selectLaunchIdeas } = await load()

    const picked = selectLaunchIdeas(POOL)

    expect(picked.map((i) => i.id)).toEqual(['c1', 'p1', 'u1', 'l1', 'c2', 'p2', 'u2', 'p3', 'u3'])
  })

  it('honours custom limits and can leave the last call out', async () => {
    const { selectLaunchIdeas } = await load()

    const picked = selectLaunchIdeas(POOL, { combos: 1, upgrades: 0, pairings: 1, lastCall: false })

    expect(picked.map((i) => i.id)).toEqual(['c1', 'p1'])
  })

  it('never mutates the input list', async () => {
    const { selectLaunchIdeas } = await load()
    const before = POOL.map((i) => i.id)

    selectLaunchIdeas(POOL, { combos: 0 })

    expect(POOL.map((i) => i.id)).toEqual(before)
  })
})
