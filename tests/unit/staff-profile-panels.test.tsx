import { render, screen } from '@testing-library/react'
import { StaffShiftHistory } from '@/components/admin/staff/staff-shift-history'
import { StaffDayHistory } from '@/components/admin/staff/staff-day-history'
import { groupActivityByDay } from '@/lib/staff-activity/staff-profile'
import type { OrderStatusEvent } from '@/lib/staff-activity/order-event'
import type { StaffShiftRecord } from '@/lib/staff-activity/staff-activity-service'

const NOW_ISO = '2026-09-19T10:00:00Z'
const NOW = Date.parse(NOW_ISO)

function shift(overrides: Partial<StaffShiftRecord> = {}): StaffShiftRecord {
  return {
    id: 's1',
    outletId: null,
    staffUserId: 'ana',
    staffName: 'Ana Cruz',
    status: 'closed',
    openingFloat: 500,
    expectedCash: 1500,
    closingCount: 1450,
    note: null,
    openedAt: '2026-09-19T01:00:00Z',
    closedAt: '2026-09-19T09:00:00Z',
    ...overrides,
  }
}

function event(overrides: Partial<OrderStatusEvent> = {}): OrderStatusEvent {
  return {
    id: 'e1',
    tenantId: 't1',
    outletId: null,
    backend: 'platform_supabase',
    externalOrderId: 'abcdef123456',
    event: 'status_changed',
    status: 'confirmed',
    previousStatus: 'pending',
    source: 'online',
    orderTotal: 250,
    actorUserId: 'ana',
    actorName: 'Ana Cruz',
    occurredAt: '2026-09-19T03:00:00Z',
    ...overrides,
  }
}

describe('StaffShiftHistory', () => {
  test('a counted drawer reads its verdict, its float and what was handed over', () => {
    render(<StaffShiftHistory shifts={[shift()]} nowMs={NOW} nowIso={NOW_ISO} outlets={[]} />)
    const history = screen.getByTestId('staff-shift-history')
    expect(history).toHaveTextContent('Short ₱50.00')
    expect(history).toHaveTextContent('₱1,000.00') // turnover, not the whole drawer
    expect(history).toHaveTextContent('9:00 AM')
    expect(history).toHaveTextContent('8h 0m')
  })

  test('an uncounted drawer is not reported as balanced', () => {
    render(
      <StaffShiftHistory
        shifts={[shift({ expectedCash: null, closingCount: null })]}
        nowMs={NOW}
        nowIso={NOW_ISO}
        outlets={[]}
      />,
    )
    expect(screen.getByTestId('staff-shift-history')).toHaveTextContent('Not counted')
    expect(screen.queryByText(/balanced/i)).not.toBeInTheDocument()
  })

  test('an open drawer says it is still open rather than inventing a close time', () => {
    render(
      <StaffShiftHistory
        shifts={[shift({ status: 'open', closedAt: null, expectedCash: null, closingCount: null })]}
        nowMs={NOW}
        nowIso={NOW_ISO}
        outlets={[]}
      />,
    )
    const history = screen.getByTestId('staff-shift-history')
    expect(history).toHaveTextContent('still open')
    expect(history).toHaveTextContent('Open now')
  })

  test('names the branch when the store has any', () => {
    render(
      <StaffShiftHistory
        shifts={[shift({ outletId: 'north' })]}
        nowMs={NOW}
        nowIso={NOW_ISO}
        outlets={[{ id: 'north', name: 'North Branch' }]}
      />,
    )
    expect(screen.getByTestId('staff-shift-history')).toHaveTextContent('North Branch')
  })

  test('an empty period explains itself', () => {
    render(<StaffShiftHistory shifts={[]} nowMs={NOW} nowIso={NOW_ISO} outlets={[]} />)
    expect(screen.getByText(/no shifts in this period/i)).toBeInTheDocument()
  })
})

describe('StaffDayHistory', () => {
  test('leads each day with its own totals and the drawer that was open', () => {
    const days = groupActivityByDay(
      [event(), event({ id: 'p', event: 'placed', status: 'pending', source: 'pos', orderTotal: 320 })],
      [shift()],
    )
    render(<StaffDayHistory days={days} nowIso={NOW_ISO} nowMs={NOW} />)
    const today = screen.getByTestId('staff-day-2026-09-19')
    expect(today).toHaveTextContent('Today')
    expect(today).toHaveTextContent('1 rang up (₱320.00)')
    expect(today).toHaveTextContent('1 confirmed')
    expect(today).toHaveTextContent('9:00 AM')
  })

  test('each act names what it was and which order it was', () => {
    render(<StaffDayHistory days={groupActivityByDay([event()], [])} nowIso={NOW_ISO} nowMs={NOW} />)
    const today = screen.getByTestId('staff-day-2026-09-19')
    expect(today).toHaveTextContent('Confirmed')
    expect(today).toHaveTextContent('#123456')
    expect(today).toHaveTextContent('web order')
  })

  test('a day spent on shift with no orders says so rather than reading empty', () => {
    render(<StaffDayHistory days={groupActivityByDay([], [shift()])} nowIso={NOW_ISO} nowMs={NOW} />)
    expect(screen.getByTestId('staff-day-2026-09-19')).toHaveTextContent('On shift, no orders handled')
  })

  test('warns when the window was cut short', () => {
    render(<StaffDayHistory days={groupActivityByDay([event()], [])} nowIso={NOW_ISO} nowMs={NOW} isTruncated />)
    expect(screen.getByText(/more activity than one page holds/i)).toBeInTheDocument()
  })

  test('an empty period explains itself', () => {
    render(<StaffDayHistory days={[]} nowIso={NOW_ISO} nowMs={NOW} />)
    expect(screen.getByText(/nothing recorded in this period/i)).toBeInTheDocument()
  })
})
