import {
  buildStaffDirectory,
  groupActivityByDay,
  summarizeTeam,
} from '@/lib/staff-activity/staff-profile'
import type { OrderStatusEvent } from '@/lib/staff-activity/order-event'
import type { StaffShiftRecord } from '@/lib/staff-activity/staff-activity-service'
import type { StaffRecord } from '@/lib/staff-service'

const NOW = Date.parse('2026-09-19T10:00:00Z')
const WINDOW = { startMs: NOW - 7 * 24 * 3_600_000, endMs: NOW }

function member(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    user_id: 'ana',
    tenant_id: 't1',
    role: 'admin',
    is_owner: false,
    outlet_id: null,
    permissions: ['pos'],
    display_name: 'Ana Cruz',
    email: 'ana@x.com',
    default_tab: null,
    created_at: '2026-01-05T00:00:00Z',
    ...overrides,
  }
}

function event(overrides: Partial<OrderStatusEvent> = {}): OrderStatusEvent {
  return {
    id: 'e1',
    tenantId: 't1',
    outletId: null,
    backend: 'platform_supabase',
    externalOrderId: 'order-1',
    event: 'status_changed',
    status: 'confirmed',
    previousStatus: 'pending',
    source: 'online',
    orderTotal: 250,
    actorUserId: 'ana',
    actorName: 'ana@x.com',
    occurredAt: new Date(NOW - 3_600_000).toISOString(),
    ...overrides,
  }
}

function shift(overrides: Partial<StaffShiftRecord> = {}): StaffShiftRecord {
  return {
    id: 's1',
    outletId: null,
    staffUserId: 'ana',
    staffName: 'Ana Cruz',
    status: 'closed',
    openingFloat: 500,
    expectedCash: 1500,
    closingCount: 1500,
    note: null,
    openedAt: new Date(NOW - 9 * 3_600_000).toISOString(),
    closedAt: new Date(NOW - 1 * 3_600_000).toISOString(),
    ...overrides,
  }
}

describe('buildStaffDirectory', () => {
  test('lists a member who has done nothing yet, with zeroed figures', () => {
    const [entry] = buildStaffDirectory({
      members: [member()],
      events: [],
      shifts: [],
      window: WINDOW,
      nowMs: NOW,
    })
    expect(entry.userId).toBe('ana')
    expect(entry.name).toBe('Ana Cruz')
    expect(entry.activity.posSales).toBe(0)
    expect(entry.shifts.count).toBe(0)
    expect(entry.lastActiveAt).toBeNull()
    expect(entry.isFormer).toBe(false)
  })

  test('carries each person their own orders, shifts and last-seen stamp', () => {
    const [entry] = buildStaffDirectory({
      members: [member()],
      events: [event(), event({ id: 'e2', event: 'placed', status: 'pending', source: 'pos', orderTotal: 80 })],
      shifts: [shift(), shift({ id: 's2', staffUserId: 'ben' })],
      window: WINDOW,
      nowMs: NOW,
    })
    expect(entry.activity.confirmed).toBe(1)
    expect(entry.activity.posSales).toBe(1)
    expect(entry.activity.posSalesTotal).toBe(80)
    expect(entry.shifts.count).toBe(1)
    expect(entry.lastActiveAt).toBe(new Date(NOW - 3_600_000).toISOString())
  })

  test('an open drawer marks the person on shift, and sorts them to the front', () => {
    const entries = buildStaffDirectory({
      members: [
        member({ user_id: 'busy', display_name: 'Busy' }),
        member({ user_id: 'ana', display_name: 'Ana Cruz' }),
      ],
      events: [event({ actorUserId: 'busy' }), event({ id: 'e2', actorUserId: 'busy', status: 'delivered' })],
      shifts: [shift({ status: 'open', closedAt: null, expectedCash: null, closingCount: null })],
      window: WINDOW,
      nowMs: NOW,
    })
    expect(entries.map((entry) => entry.userId)).toEqual(['ana', 'busy'])
    expect(entries[0].openShift).not.toBeNull()
    expect(entries[1].openShift).toBeNull()
  })

  test('someone removed from the roster keeps their history, flagged as former', () => {
    const entries = buildStaffDirectory({
      members: [member()],
      events: [event({ id: 'gone', actorUserId: 'ghost', actorName: 'Gone Guy' })],
      shifts: [],
      window: WINDOW,
      nowMs: NOW,
    })
    const former = entries.find((entry) => entry.userId === 'ghost')
    expect(former).toMatchObject({ name: 'Gone Guy', isFormer: true, isOwner: false })
  })

  test('the owner is one of the people, named as such', () => {
    const [entry] = buildStaffDirectory({
      members: [member({ user_id: 'boss', display_name: 'Boss', is_owner: true })],
      events: [],
      shifts: [],
      window: WINDOW,
      nowMs: NOW,
    })
    expect(entry.isOwner).toBe(true)
  })

  test('an account with no name at all still reads as something', () => {
    const [entry] = buildStaffDirectory({
      members: [member({ display_name: null, email: null })],
      events: [],
      shifts: [],
      window: WINDOW,
      nowMs: NOW,
    })
    expect(entry.name).toBe('Unnamed account')
  })
})

describe('summarizeTeam', () => {
  test('counts the roster, who is on now, and what the team handled', () => {
    const entries = buildStaffDirectory({
      members: [member(), member({ user_id: 'ben', display_name: 'Ben' })],
      events: [
        event({ id: 'p1', event: 'placed', status: 'pending', source: 'pos', orderTotal: 120 }),
        event({ id: 'c1', actorUserId: 'ben' }),
        event({ id: 'x1', actorUserId: 'ben', status: 'cancelled', orderTotal: 90 }),
      ],
      shifts: [shift({ status: 'open', closedAt: null, expectedCash: null, closingCount: null }), shift({ id: 's9', closingCount: 1480 })],
      window: WINDOW,
      nowMs: NOW,
    })
    const stats = summarizeTeam(entries)
    expect(stats.headcount).toBe(2)
    expect(stats.onShift).toBe(1)
    expect(stats.posSales).toBe(1)
    expect(stats.posSalesTotal).toBe(120)
    expect(stats.ordersHandled).toBe(3)
    expect(stats.cancelled).toBe(1)
    expect(stats.netVariance).toBe(-20)
  })

  test('former staff are history, not headcount', () => {
    const entries = buildStaffDirectory({
      members: [member()],
      events: [event({ id: 'gone', actorUserId: 'ghost', actorName: 'Gone Guy' })],
      shifts: [],
      window: WINDOW,
      nowMs: NOW,
    })
    expect(summarizeTeam(entries).headcount).toBe(1)
  })
})

describe('groupActivityByDay', () => {
  test('groups by the merchant’s own day, newest first', () => {
    const days = groupActivityByDay(
      [
        event({ id: 'late', occurredAt: '2026-09-18T15:30:00Z' }), // 18th, 11:30pm Manila
        event({ id: 'next', occurredAt: '2026-09-18T17:30:00Z' }), // 19th, 1:30am Manila
      ],
      [],
    )
    expect(days.map((day) => day.dayKey)).toEqual(['2026-09-19', '2026-09-18'])
  })

  test('each day carries its own counts, takings and shifts', () => {
    const days = groupActivityByDay(
      [
        event({ id: 'p', event: 'placed', status: 'pending', source: 'pos', orderTotal: 200, occurredAt: '2026-09-19T02:00:00Z' }),
        event({ id: 'c', occurredAt: '2026-09-19T03:00:00Z', orderTotal: 300 }),
        event({ id: 'x', status: 'cancelled', occurredAt: '2026-09-19T04:00:00Z' }),
      ],
      [shift({ openedAt: '2026-09-19T01:00:00Z', closedAt: '2026-09-19T09:00:00Z' })],
    )
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({
      dayKey: '2026-09-19',
      posSales: 1,
      posSalesTotal: 200,
      confirmed: 1,
      cancelled: 1,
    })
    expect(days[0].shifts).toHaveLength(1)
    expect(days[0].events.map((entry) => entry.id)).toEqual(['x', 'c', 'p'])
  })

  test('a day with only a shift still appears — being on is activity', () => {
    const days = groupActivityByDay([], [shift({ openedAt: '2026-09-17T01:00:00Z', closedAt: '2026-09-17T09:00:00Z' })])
    expect(days.map((day) => day.dayKey)).toEqual(['2026-09-17'])
    expect(days[0].events).toHaveLength(0)
  })
})
