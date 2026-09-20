import { fireEvent, render, screen } from '@testing-library/react'
import { StaffDirectory } from '@/components/admin/staff/staff-directory'
import type { StaffDirectoryEntry } from '@/lib/staff-activity/staff-profile'
import { EMPTY_SHIFT_TOTALS } from '@/lib/staff-activity/shift-summary'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/actions/staff', () => ({
  createStaffAction: jest.fn(async () => ({ success: true, data: {} })),
}))

const NOW = Date.parse('2026-09-19T10:00:00Z')

function entry(overrides: Partial<StaffDirectoryEntry> = {}): StaffDirectoryEntry {
  return {
    userId: 'ana',
    name: 'Ana Cruz',
    email: 'ana@x.com',
    isOwner: false,
    isFormer: false,
    outletId: null,
    permissions: ['pos'],
    defaultTab: null,
    joinedAt: '2026-01-05T00:00:00Z',
    activity: {
      actorUserId: 'ana',
      actorName: 'Ana Cruz',
      posSales: 4,
      posSalesTotal: 1200,
      confirmed: 2,
      confirmedTotal: 500,
      cancelled: 1,
      completed: 3,
      progressed: 0,
      lastActiveAt: new Date(NOW - 3_600_000).toISOString(),
    },
    shifts: { ...EMPTY_SHIFT_TOTALS, count: 2, workedMs: 8 * 3_600_000 },
    openShift: null,
    lastActiveAt: new Date(NOW - 3_600_000).toISOString(),
    ...overrides,
  }
}

const base = {
  basePath: '/resto/admin/staff',
  tenantId: 't1',
  tenantSlug: 'resto',
  outlets: [],
  seatLimit: 3,
  seatsRemaining: 2,
  nowMs: NOW,
}

describe('StaffDirectory', () => {
  test('gives each person a card that opens their profile', () => {
    render(<StaffDirectory {...base} entries={[entry()]} />)
    const link = screen.getByRole('link', { name: /ana cruz/i })
    expect(link).toHaveAttribute('href', '/resto/admin/staff/ana?period=7d')
    expect(screen.getByTestId('staff-card-ana')).toHaveTextContent('₱1,200')
  })

  test('marks who is behind the counter right now', () => {
    render(
      <StaffDirectory
        {...base}
        entries={[
          entry({
            openShift: {
              id: 's1', outletId: null, staffUserId: 'ana', staffName: 'Ana Cruz', status: 'open',
              openingFloat: 500, expectedCash: null, closingCount: null, note: null,
              openedAt: new Date(NOW - 2 * 3_600_000).toISOString(), closedAt: null,
            },
          }),
        ]}
      />,
    )
    expect(screen.getByTestId('staff-card-ana')).toHaveTextContent('On shift')
  })

  test('searching narrows the list by name or email', () => {
    render(<StaffDirectory {...base} entries={[entry(), entry({ userId: 'ben', name: 'Ben Reyes', email: 'ben@x.com' })]} />)
    fireEvent.change(screen.getByLabelText(/search staff/i), { target: { value: 'ben@' } })
    expect(screen.queryByTestId('staff-card-ana')).not.toBeInTheDocument()
    expect(screen.getByTestId('staff-card-ben')).toBeInTheDocument()
  })

  test('says so when a search matches nobody, without losing the search box', () => {
    render(<StaffDirectory {...base} entries={[entry()]} />)
    fireEvent.change(screen.getByLabelText(/search staff/i), { target: { value: 'zzz' } })
    expect(screen.getByText(/no one matches/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/search staff/i)).toBeInTheDocument()
  })

  test('former staff are kept out of the roster view until asked for', () => {
    render(<StaffDirectory {...base} entries={[entry(), entry({ userId: 'ghost', name: 'Gone Guy', isFormer: true })]} />)
    expect(screen.queryByTestId('staff-card-ghost')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /past staff/i }))
    expect(screen.getByTestId('staff-card-ghost')).toHaveTextContent('Former')
  })

  test('the owner does not occupy one of the plan’s seats', () => {
    render(
      <StaffDirectory
        {...base}
        entries={[entry({ userId: 'boss', name: 'Boss', isOwner: true }), entry()]}
      />,
    )
    expect(screen.getByTestId('staff-seats')).toHaveTextContent('1 of 3 staff')
  })

  test('the add button is offered until the seats run out', () => {
    const { rerender } = render(<StaffDirectory {...base} entries={[entry()]} />)
    expect(screen.getByRole('button', { name: /add staff member/i })).toBeEnabled()
    rerender(<StaffDirectory {...base} seatsRemaining={0} entries={[entry()]} />)
    expect(screen.getByRole('button', { name: /add staff member/i })).toBeDisabled()
  })

  test('an empty roster explains what to do instead of showing a blank grid', () => {
    render(<StaffDirectory {...base} entries={[]} />)
    expect(screen.getByText(/no staff accounts yet/i)).toBeInTheDocument()
  })
})
