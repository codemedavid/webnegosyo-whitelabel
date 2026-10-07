import { describe, it, expect } from '@jest/globals'
import {
  nextItemOrder,
  planItemArrangement,
  STALE_ARRANGEMENT_ERROR,
} from '@/lib/menu-item-arrangement'

const current = [
  { id: 'a', order: 0 },
  { id: 'b', order: 1 },
  { id: 'c', order: 2 },
]

describe('planItemArrangement', () => {
  it('numbers the requested arrangement 0..n and writes only rows that moved', () => {
    const plan = planItemArrangement(current, ['c', 'a', 'b'])

    expect(plan).toEqual({
      ok: true,
      writes: [
        { id: 'c', order: 0 },
        { id: 'a', order: 1 },
        { id: 'b', order: 2 },
      ],
    })
  })

  it('skips rows already at their new position', () => {
    const plan = planItemArrangement(current, ['a', 'c', 'b'])

    expect(plan).toEqual({
      ok: true,
      writes: [
        { id: 'c', order: 1 },
        { id: 'b', order: 2 },
      ],
    })
  })

  it('renumbers tied positions so the order is total (live stores have many ties at 0)', () => {
    const tied = [
      { id: 'a', order: 0 },
      { id: 'b', order: 0 },
      { id: 'c', order: 0 },
    ]

    const plan = planItemArrangement(tied, ['a', 'b', 'c'])

    expect(plan).toEqual({
      ok: true,
      writes: [
        { id: 'b', order: 1 },
        { id: 'c', order: 2 },
      ],
    })
  })

  it('writes nothing when the arrangement is unchanged', () => {
    expect(planItemArrangement(current, ['a', 'b', 'c'])).toEqual({ ok: true, writes: [] })
  })

  it('refuses an arrangement missing a dish (a dish added elsewhere since the page loaded)', () => {
    expect(planItemArrangement(current, ['a', 'b'])).toEqual({ ok: false, error: STALE_ARRANGEMENT_ERROR })
  })

  it('refuses an arrangement naming a dish that is not in the category', () => {
    expect(planItemArrangement(current, ['a', 'b', 'x'])).toEqual({ ok: false, error: STALE_ARRANGEMENT_ERROR })
  })

  it('refuses a duplicated dish', () => {
    expect(planItemArrangement(current, ['a', 'a', 'b'])).toEqual({ ok: false, error: STALE_ARRANGEMENT_ERROR })
  })

  it('does not mutate its inputs', () => {
    const items = current.map((item) => ({ ...item }))
    const ids = ['c', 'b', 'a']

    planItemArrangement(items, ids)

    expect(items).toEqual(current)
    expect(ids).toEqual(['c', 'b', 'a'])
  })
})

describe('nextItemOrder', () => {
  it('places a new dish after every dish already in the category', () => {
    expect(nextItemOrder([0, 4, 2])).toBe(5)
  })

  it('starts an empty category at 0', () => {
    expect(nextItemOrder([])).toBe(0)
  })
})
