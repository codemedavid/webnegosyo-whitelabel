/**
 * Seeing when a client joined, and setting when their month turns over.
 *
 * Rows are built through the REAL roster, like the other screen tests, so this
 * cannot pass while disagreeing with the arithmetic that decides what a payment
 * buys.
 *
 * The behaviour worth guarding here is the boundary between the two dates. One
 * is history and unchangeable; the other is a billing rule the owner sets. A
 * screen that blurred them would invite the owner to "correct" a join date and
 * silently re-date a client's renewals.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { buildSubscriptionRoster, summarizeRoster } from '@/lib/billing/subscription-roster'
import { SubscriptionManager } from '@/components/superadmin/subscription-manager'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/superadmin/mark-paid-dialog', () => ({ MarkPaidDialog: () => null }))

const setTenantBillingAnchorAction = jest.fn()
jest.mock('@/app/actions/subscriptions', () => ({
  markTenantPaidAction: jest.fn(),
  setTenantPausedAction: jest.fn(),
  setTenantBillingAnchorAction: (...args: unknown[]) => setTenantBillingAnchorAction(...args),
}))

/** 2026-08-10 in Manila. */
const NOW = '2026-08-10T07:00:00.000Z'

const ANCHORED = {
  tenantId: 't-anchored',
  name: 'Alpha Cafe',
  slug: 'alpha',
  paidThrough: '2026-08-31',
  joinedAt: '2026-03-12T04:00:00.000Z',
  billingAnchorDate: '2026-08-01',
}

const UNANCHORED = {
  tenantId: 't-unanchored',
  name: 'Bravo Bakery',
  slug: 'bravo',
  paidThrough: '2026-09-30',
  joinedAt: '2026-06-05T04:00:00.000Z',
}

function renderScreen(inputs = [ANCHORED, UNANCHORED]) {
  const rows = buildSubscriptionRoster(inputs, NOW)
  return render(<SubscriptionManager rows={rows} summary={summarizeRoster(rows)} />)
}

beforeEach(() => {
  setTenantBillingAnchorAction.mockReset()
  setTenantBillingAnchorAction.mockResolvedValue({ success: true })
})

describe('the collections screen shows when a client joined', () => {
  it('shows the joined date beside the tenant', () => {
    renderScreen()

    expect(screen.getByTestId('joined-t-anchored')).toHaveTextContent(/joined Mar 12, 2026/)
  })

  it('shows each tenant’s own joined date', () => {
    renderScreen()

    expect(screen.getByTestId('joined-t-unanchored')).toHaveTextContent(/joined Jun 5, 2026/)
  })
})

describe('setting the billing start date', () => {
  it('shows the anchor a client already has', () => {
    renderScreen()

    expect(screen.getByTestId('billing-anchor-t-anchored')).toHaveTextContent('Aug 1, 2026')
  })

  it('invites a date on a client who has none, rather than showing a dash', () => {
    // "—" reads as missing data. This is a billing rule nobody has chosen yet,
    // and the owner is the one who chooses it.
    renderScreen()

    expect(screen.getByTestId('billing-anchor-t-unanchored')).toHaveTextContent('Set date')
  })

  it('saves the date the owner picks', async () => {
    renderScreen()

    fireEvent.click(screen.getByTestId('billing-anchor-t-unanchored'))
    fireEvent.change(screen.getByTestId('billing-anchor-input'), {
      target: { value: '2026-06-05' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save start date/i }))

    await waitFor(() => {
      expect(setTenantBillingAnchorAction).toHaveBeenCalledWith('t-unanchored', '2026-06-05')
    })
  })

  it('clears an anchor back to pay-day billing', async () => {
    renderScreen()

    fireEvent.click(screen.getByTestId('billing-anchor-t-anchored'))
    fireEvent.click(screen.getByTestId('billing-anchor-clear'))

    await waitFor(() => {
      expect(setTenantBillingAnchorAction).toHaveBeenCalledWith('t-anchored', null)
    })
  })

  it('offers nothing to clear on a client who has no anchor', () => {
    // Clearing an absent anchor is a write that changes nothing; offering it
    // implies there is something set.
    renderScreen()

    fireEvent.click(screen.getByTestId('billing-anchor-t-unanchored'))

    expect(screen.getByTestId('billing-anchor-clear')).toBeDisabled()
  })

  it('surfaces a refused date instead of closing as though it saved', async () => {
    // Silently closing on failure would leave the owner believing a client is
    // anchored while their renewals keep drifting.
    setTenantBillingAnchorAction.mockResolvedValue({
      success: false,
      error: 'A billing start date must be a real calendar date (YYYY-MM-DD)',
    })
    renderScreen()

    fireEvent.click(screen.getByTestId('billing-anchor-t-anchored'))
    fireEvent.click(screen.getByRole('button', { name: /save start date/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/real calendar date/i)
  })

  it('keeps the join date out of the editable column', async () => {
    // The two dates answer different questions. Opening the dialog on a client
    // must offer their ANCHOR to edit, never the day they signed up.
    renderScreen()

    fireEvent.click(screen.getByTestId('billing-anchor-t-anchored'))

    expect(screen.getByTestId('billing-anchor-input')).toHaveValue('2026-08-01')
  })

  it('leaves the paid-through date alone', () => {
    // Nothing about setting a start date touches access; the row must still
    // report what the client actually bought.
    renderScreen()

    const row = screen.getByTestId('billing-anchor-t-anchored').closest('tr')
    expect(within(row as HTMLElement).getByText('2026-08-31')).toBeInTheDocument()
  })
})
