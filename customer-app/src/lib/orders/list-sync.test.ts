import type { AppOrderSummary } from '@/lib/contract'
import { withTrackedOrder } from './list-sync'

const summary = (id: string, status: AppOrderSummary['status']): AppOrderSummary => ({
  id,
  number: '07',
  status,
  placedAt: '2026-10-26T02:00:00Z',
  orderKind: 'pickup',
  orderTypeName: 'Pick Up',
  outletName: null,
  total: 100,
  itemsPreview: ['1× Latte'],
})

describe('withTrackedOrder', () => {
  it('moves the tracked order to its latest status and leaves the rest alone', () => {
    const list = [summary('a', 'preparing'), summary('b', 'delivered')]
    const next = withTrackedOrder(list, { id: 'a', status: 'ready' })
    expect(next?.map((order) => order.status)).toEqual(['ready', 'delivered'])
    expect(next?.[1]).toBe(list[1])
  })

  it('returns the same list when nothing changed, and nothing when there is no list yet', () => {
    const list = [summary('a', 'ready')]
    expect(withTrackedOrder(list, { id: 'a', status: 'ready' })).toBe(list)
    expect(withTrackedOrder(list, { id: 'z', status: 'ready' })).toBe(list)
    expect(withTrackedOrder(undefined, { id: 'a', status: 'ready' })).toBeUndefined()
  })
})
