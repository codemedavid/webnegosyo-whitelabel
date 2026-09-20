import { recordOrderEvent, recordOrderEventBestEffort, type OrderEventStore } from '@/lib/staff-activity/record-order-event'
import type { OrderEventDraft } from '@/lib/staff-activity/order-event'

function makeStore(overrides: Partial<OrderEventStore> = {}) {
  const inserted: OrderEventDraft[] = []
  const store: OrderEventStore = {
    findLastEvent: async () => null,
    insert: async (draft) => { inserted.push(draft) },
    findActorName: async () => 'Ana Dela Cruz',
    ...overrides,
  }
  return { store, inserted }
}

const DRAFT: OrderEventDraft = {
  tenantId: 't1',
  backend: 'convex',
  externalOrderId: 'o1',
  event: 'status_changed',
  status: 'confirmed',
  actorUserId: 'ana',
  actorName: 'ana@example.com',
}

describe('recordOrderEvent', () => {
  test('writes the event under the account\'s current display name', async () => {
    const { store, inserted } = makeStore()
    await expect(recordOrderEvent(store, DRAFT)).resolves.toBe('recorded')
    expect(inserted[0]).toMatchObject({ status: 'confirmed', actorName: 'Ana Dela Cruz' })
  })

  test('falls back to the draft name when the account is unknown', async () => {
    const { store, inserted } = makeStore({ findActorName: async () => null })
    await recordOrderEvent(store, DRAFT)
    expect(inserted[0].actorName).toBe('ana@example.com')
  })

  test('skips a status the order already holds', async () => {
    const { store, inserted } = makeStore({
      findLastEvent: async () => ({ event: 'status_changed', status: 'confirmed' }),
    })
    await expect(recordOrderEvent(store, DRAFT)).resolves.toBe('redundant')
    expect(inserted).toHaveLength(0)
  })

  test('best-effort variant swallows a failed write', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { store } = makeStore({ insert: async () => { throw new Error('boom') } })
    await expect(recordOrderEventBestEffort(store, DRAFT)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
