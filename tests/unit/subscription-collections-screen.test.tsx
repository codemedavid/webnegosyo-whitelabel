/**
 * The collections screen, as the platform owner uses it.
 *
 * Two jobs this covers, both of which the table could not do before: telling
 * the owner who has to pay THIS WEEK, and giving them a lever to cut a client
 * off without opening the SQL console.
 *
 * The ordering and the arithmetic are proved in `subscription-roster.test.ts`
 * and `subscription-lifecycle.test.ts`; these tests build their rows through
 * the real roster so the screen cannot pass while disagreeing with it.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { buildSubscriptionRoster, summarizeRoster } from '@/lib/billing/subscription-roster'
import { SubscriptionManager } from '@/components/superadmin/subscription-manager'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/superadmin/mark-paid-dialog', () => ({ MarkPaidDialog: () => null }))

const setTenantPausedAction = jest.fn()
jest.mock('@/app/actions/subscriptions', () => ({
  markTenantPaidAction: jest.fn(),
  setTenantPausedAction: (...args: unknown[]) => setTenantPausedAction(...args),
}))

/** 2026-08-10 in Manila. */
const NOW = '2026-08-10T07:00:00.000Z'

const DUE_IN_2 = { tenantId: 't-2d', name: 'Echo Eatery', slug: 'echo', paidThrough: '2026-08-12' }
const COMFORTABLE = {
  tenantId: 't-far',
  name: 'Foxtrot Fry',
  slug: 'foxtrot',
  paidThrough: '2026-09-30',
}
const LAPSED = {
  tenantId: 't-late',
  name: 'Delta Deli',
  slug: 'delta',
  paidThrough: '2026-05-01',
}
const MANUALLY_PAUSED = {
  tenantId: 't-off',
  name: 'Golf Grill',
  slug: 'golf',
  status: 'paused',
  paidThrough: '2026-12-31',
}
const CANCELLED = {
  tenantId: 't-gone',
  name: 'Hotel Hawker',
  slug: 'hotel',
  status: 'cancelled',
  paidThrough: '2026-12-31',
}

function renderScreen(inputs: Parameters<typeof buildSubscriptionRoster>[0]) {
  const rows = buildSubscriptionRoster(inputs, NOW)
  return render(<SubscriptionManager rows={rows} summary={summarizeRoster(rows)} />)
}

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest('tr') as HTMLElement
}

beforeEach(() => {
  setTenantPausedAction.mockReset()
  setTenantPausedAction.mockResolvedValue({ success: true })
})

describe('who needs paying within seven days', () => {
  it('headlines how many tenants come due this week', () => {
    // Arrange / Act
    renderScreen([DUE_IN_2, COMFORTABLE, LAPSED])

    // Assert
    const stat = screen.getByTestId('stat-due-soon')
    expect(within(stat).getByText('1')).toBeInTheDocument()
  })

  it('shows how many days each about-to-lapse tenant has left', () => {
    renderScreen([DUE_IN_2, COMFORTABLE])

    expect(within(rowFor('Echo Eatery')).getByText('2d')).toBeInTheDocument()
  })

  it('narrows the table to only those who owe or are about to, on request', () => {
    // The whole question the owner opens this screen to answer. A comfortably
    // paid tenant is noise in that view.
    renderScreen([DUE_IN_2, COMFORTABLE, LAPSED])

    fireEvent.click(screen.getByRole('button', { name: /needs payment/i }))

    expect(screen.getByText('Echo Eatery')).toBeInTheDocument()
    expect(screen.getByText('Delta Deli')).toBeInTheDocument()
    expect(screen.queryByText('Foxtrot Fry')).not.toBeInTheDocument()
  })

  it('brings everyone back when the filter is switched off again', () => {
    renderScreen([DUE_IN_2, COMFORTABLE])

    fireEvent.click(screen.getByRole('button', { name: /needs payment/i }))
    fireEvent.click(screen.getByRole('button', { name: /all tenants/i }))

    expect(screen.getByText('Foxtrot Fry')).toBeInTheDocument()
  })

  it('says so plainly when nobody is due this week, rather than showing a blank table', () => {
    renderScreen([COMFORTABLE])

    fireEvent.click(screen.getByRole('button', { name: /needs payment/i }))

    expect(screen.getByText(/nobody needs chasing/i)).toBeInTheDocument()
  })
})

describe('pausing and resuming a tenant', () => {
  it('offers to pause a tenant who is still running', () => {
    renderScreen([COMFORTABLE])

    expect(
      within(rowFor('Foxtrot Fry')).getByRole('button', { name: /^pause$/i })
    ).toBeInTheDocument()
  })

  it('cuts the tenant off through the action, never by guessing at the row', async () => {
    // Arrange
    renderScreen([COMFORTABLE])

    // Act
    fireEvent.click(within(rowFor('Foxtrot Fry')).getByRole('button', { name: /^pause$/i }))

    // Assert
    await waitFor(() => expect(setTenantPausedAction).toHaveBeenCalledWith('t-far', true))
  })

  it('offers to resume a tenant the owner has already cut off', () => {
    renderScreen([MANUALLY_PAUSED])

    expect(
      within(rowFor('Golf Grill')).getByRole('button', { name: /^resume$/i })
    ).toBeInTheDocument()
  })

  it('lifts the block through the same action', async () => {
    renderScreen([MANUALLY_PAUSED])

    fireEvent.click(within(rowFor('Golf Grill')).getByRole('button', { name: /^resume$/i }))

    await waitFor(() => expect(setTenantPausedAction).toHaveBeenCalledWith('t-off', false))
  })

  it('does not offer to resume a tenant who is merely overdue', () => {
    // They were never cut off by hand — the dates closed them, and only a
    // payment reopens them. A Resume button here would look like a way to give
    // access back without being paid.
    renderScreen([LAPSED])

    expect(
      within(rowFor('Delta Deli')).queryByRole('button', { name: /^resume$/i })
    ).not.toBeInTheDocument()
  })

  it('does not offer to resume a cancelled tenant', () => {
    // Cancelling ended the relationship. "Resume" on this row writes
    // `status = 'active'`, so a single click would resurrect a closed account
    // and destroy the record that it was ever cancelled.
    renderScreen([CANCELLED])

    expect(
      within(rowFor('Hotel Hawker')).queryByRole('button', { name: /^resume$/i })
    ).not.toBeInTheDocument()
  })

  it('offers no lifecycle lever at all on a cancelled tenant', () => {
    // Nor "Pause" — pausing a cancelled account is meaningless, and the button
    // would still be one click from writing a status the owner did not choose.
    renderScreen([CANCELLED])

    expect(
      within(rowFor('Hotel Hawker')).queryByRole('button', { name: /^pause$/i })
    ).not.toBeInTheDocument()
  })

  it('says plainly that a cancelled tenant is cancelled, not merely paused', () => {
    renderScreen([CANCELLED])

    expect(within(rowFor('Hotel Hawker')).getByText(/cancelled/i)).toBeInTheDocument()
  })

  it('surfaces a refused pause instead of appearing to have worked', async () => {
    // A silent failure here is the worst case on this screen: the owner walks
    // away believing a merchant is cut off when they are still trading.
    setTenantPausedAction.mockResolvedValue({ success: false, error: 'Only a platform superadmin can manage subscriptions.' })
    renderScreen([COMFORTABLE])

    fireEvent.click(within(rowFor('Foxtrot Fry')).getByRole('button', { name: /^pause$/i }))

    expect(await screen.findByText(/only a platform superadmin/i)).toBeInTheDocument()
  })
})
