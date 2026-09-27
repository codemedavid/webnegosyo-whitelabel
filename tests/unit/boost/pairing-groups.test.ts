import { groupPairings, planPairingSave } from '@/lib/boost/pairing-groups'

const row = (id: string, source: string, target: string, order: number, active = true) => ({
  id,
  source_item_id: source,
  target_item_id: target,
  display_order: order,
  is_active: active,
})

describe('groupPairings', () => {
  it('merges sources that suggest the same items in the same order', () => {
    const groups = groupPairings([
      row('1', 'burger', 'fries', 0),
      row('2', 'burger', 'coke', 1),
      row('3', 'cheese', 'fries', 0),
      row('4', 'cheese', 'coke', 1),
      row('5', 'pasta', 'garlic', 0),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ sourceIds: ['burger', 'cheese'], targetIds: ['fries', 'coke'], isActive: true })
    expect(groups[0].pairIds.sort()).toEqual(['1', '2', '3', '4'])
    expect(groups[1]).toMatchObject({ sourceIds: ['pasta'], targetIds: ['garlic'] })
  })

  it('orders targets by display order, not row order', () => {
    const [group] = groupPairings([row('1', 'a', 'y', 1), row('2', 'a', 'x', 0)])
    expect(group.targetIds).toEqual(['x', 'y'])
  })

  it('keeps a paused source apart from a live one', () => {
    const groups = groupPairings([row('1', 'a', 'x', 0, true), row('2', 'b', 'x', 0, false)])
    expect(groups.map((g) => [g.sourceIds, g.isActive])).toEqual([
      [['a'], true],
      [['b'], false],
    ])
  })

  it('gives each group a stable key', () => {
    const a = groupPairings([row('1', 'a', 'x', 0)])[0].key
    const b = groupPairings([row('9', 'a', 'x', 0)])[0].key
    expect(a).toBe(b)
  })
})

describe('planPairingSave', () => {
  it('replaces every row of the old and new sources', () => {
    const plan = planPairingSave({
      previousSourceIds: ['burger', 'cheese'],
      sourceIds: ['burger', 'chicken'],
      targetIds: ['fries', 'coke'],
      isActive: true,
    })
    expect(plan.deleteSourceIds.sort()).toEqual(['burger', 'cheese', 'chicken'])
    expect(plan.rows).toEqual([
      { source_item_id: 'burger', target_item_id: 'fries', display_order: 0, is_active: true },
      { source_item_id: 'burger', target_item_id: 'coke', display_order: 1, is_active: true },
      { source_item_id: 'chicken', target_item_id: 'fries', display_order: 0, is_active: true },
      { source_item_id: 'chicken', target_item_id: 'coke', display_order: 1, is_active: true },
    ])
  })

  it('never pairs an item with itself and drops duplicates', () => {
    const plan = planPairingSave({
      previousSourceIds: [],
      sourceIds: ['burger', 'burger'],
      targetIds: ['burger', 'fries', 'fries'],
      isActive: false,
    })
    expect(plan.rows).toEqual([
      { source_item_id: 'burger', target_item_id: 'fries', display_order: 0, is_active: false },
    ])
  })
})
