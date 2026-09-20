/**
 * The pure rules behind the staff activity log: when an event is worth
 * writing, and how a window of events becomes one row per person.
 */
import {
  classifyEvent,
  selectActorEvents,
  shouldRecordEvent,
  summarizeStaffActivity,
  type OrderStatusEvent,
} from '@/lib/staff-activity/order-event'

const T0 = Date.parse('2026-09-19T08:00:00Z')
const HOUR = 60 * 60 * 1000
const WINDOW = { startMs: T0, endMs: T0 + 8 * HOUR }

function event(overrides: Partial<OrderStatusEvent>): OrderStatusEvent {
  return {
    id: 'e1',
    tenantId: 't1',
    outletId: null,
    backend: 'convex',
    externalOrderId: 'o1',
    event: 'status_changed',
    status: 'confirmed',
    previousStatus: 'pending',
    source: 'online',
    orderTotal: 250,
    actorUserId: 'ana',
    actorName: 'Ana',
    occurredAt: new Date(T0 + HOUR).toISOString(),
    ...overrides,
  }
}

describe('shouldRecordEvent', () => {
  test('records the first status change of an order', () => {
    expect(shouldRecordEvent(null, { event: 'status_changed', status: 'confirmed' })).toBe(true)
  })

  test('drops a status the log already holds for the order (retry / prep-time resend)', () => {
    expect(
      shouldRecordEvent({ event: 'status_changed', status: 'confirmed' }, { event: 'status_changed', status: 'confirmed' }),
    ).toBe(false)
  })

  test('records a move to a different status, including a recall', () => {
    expect(
      shouldRecordEvent({ event: 'status_changed', status: 'ready' }, { event: 'status_changed', status: 'preparing' }),
    ).toBe(true)
  })

  test('records a placement only when the order has no events yet', () => {
    expect(shouldRecordEvent(null, { event: 'placed', status: 'pending' })).toBe(true)
    expect(shouldRecordEvent({ event: 'placed', status: 'pending' }, { event: 'placed', status: 'pending' })).toBe(false)
  })
})

describe('classifyEvent', () => {
  test('names the register sale, the confirm, the cancel, the completion and kitchen moves', () => {
    expect(classifyEvent({ event: 'placed', status: 'pending', source: 'pos' })).toBe('pos_sale')
    expect(classifyEvent({ event: 'status_changed', status: 'confirmed', source: null })).toBe('confirmed')
    expect(classifyEvent({ event: 'status_changed', status: 'cancelled', source: null })).toBe('cancelled')
    expect(classifyEvent({ event: 'status_changed', status: 'delivered', source: null })).toBe('completed')
    expect(classifyEvent({ event: 'status_changed', status: 'ready', source: null })).toBe('progressed')
  })
})

describe('summarizeStaffActivity', () => {
  test('counts and totals one row per person, busiest first', () => {
    const rows = summarizeStaffActivity(
      [
        event({ id: '1' }),
        event({ id: '2', externalOrderId: 'o2', orderTotal: 100 }),
        event({ id: '3', externalOrderId: 'o3', status: 'cancelled' }),
        event({ id: '4', externalOrderId: 'o4', event: 'placed', status: 'pending', source: 'pos', orderTotal: 80.5 }),
        event({ id: '5', externalOrderId: 'o5', status: 'delivered' }),
        event({ id: '6', externalOrderId: 'o6', status: 'preparing' }),
        event({ id: '7', externalOrderId: 'o7', actorUserId: 'ben', actorName: 'Ben' }),
      ],
      WINDOW,
    )

    expect(rows.map((row) => row.actorUserId)).toEqual(['ana', 'ben'])
    expect(rows[0]).toMatchObject({
      actorName: 'Ana',
      confirmed: 2,
      confirmedTotal: 350,
      cancelled: 1,
      posSales: 1,
      posSalesTotal: 80.5,
      completed: 1,
      progressed: 1,
    })
    expect(rows[1]).toMatchObject({ actorName: 'Ben', confirmed: 1, confirmedTotal: 250 })
  })

  test('ignores events outside the window and events with no actor', () => {
    const rows = summarizeStaffActivity(
      [
        event({ id: '1', occurredAt: new Date(T0 - 1).toISOString() }),
        event({ id: '2', occurredAt: new Date(T0 + 9 * HOUR).toISOString() }),
        event({ id: '3', actorUserId: null, actorName: 'Someone' }),
      ],
      WINDOW,
    )
    expect(rows).toEqual([])
  })

  test('a missing total counts the act but adds nothing to the money', () => {
    const [row] = summarizeStaffActivity([event({ orderTotal: null })], WINDOW)
    expect(row).toMatchObject({ confirmed: 1, confirmedTotal: 0 })
  })

  test('reads the person by their most recent name and remembers when they were last active', () => {
    const later = new Date(T0 + 3 * HOUR).toISOString()
    const [row] = summarizeStaffActivity(
      [event({ id: '1', actorName: 'Ana D.', occurredAt: later }), event({ id: '2', actorName: 'Ana' })],
      WINDOW,
    )
    expect(row.actorName).toBe('Ana D.')
    expect(row.lastActiveAt).toBe(later)
  })
})

describe('selectActorEvents', () => {
  test('returns one person\'s events inside the window, newest first', () => {
    const early = event({ id: 'early' })
    const late = event({ id: 'late', occurredAt: new Date(T0 + 2 * HOUR).toISOString() })
    const other = event({ id: 'other', actorUserId: 'ben' })
    const outside = event({ id: 'outside', occurredAt: new Date(T0 + 20 * HOUR).toISOString() })

    expect(selectActorEvents([early, other, late, outside], 'ana', WINDOW).map((e) => e.id)).toEqual(['late', 'early'])
  })
})
