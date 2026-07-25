/**
 * Storefront closed notice.
 *
 * The banner is the customer-visible half of operating-hours enforcement: it must
 * be silent whenever ordering is allowed (so an unconfigured or opted-out tenant
 * sees zero change) and, when the shop is closed, it must say both *that* ordering
 * is closed and *when* it resumes.
 */

import { render, screen } from '@testing-library/react'
import { StoreClosedBanner } from '@/components/customer/store-closed-banner'
import { ALWAYS_OPEN_STATUS, type StoreOpenStatus } from '@/lib/store-open-status'

function closedStatus(overrides: Partial<StoreOpenStatus> = {}): StoreOpenStatus {
  return {
    isOpen: false,
    isOrderingBlocked: true,
    reason: 'after_close',
    nextOpenLabel: 'tomorrow at 9:00 AM',
    closesAt: null,
    ...overrides,
  }
}

describe('StoreClosedBanner', () => {
  it('renders nothing while the store is open', () => {
    const { container } = render(<StoreClosedBanner status={ALWAYS_OPEN_STATUS} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('announces that ordering is currently closed', () => {
    render(<StoreClosedBanner status={closedStatus()} />)
    expect(screen.getByTestId('store-closed-banner')).toHaveTextContent(/ordering is currently closed/i)
  })

  it('tells the customer when ordering reopens', () => {
    render(<StoreClosedBanner status={closedStatus()} />)
    expect(screen.getByTestId('store-closed-banner')).toHaveTextContent('Opens tomorrow at 9:00 AM')
  })

  it('omits the reopening line when there is no next opening', () => {
    render(<StoreClosedBanner status={closedStatus({ nextOpenLabel: null })} />)
    expect(screen.getByTestId('store-closed-banner')).not.toHaveTextContent(/opens/i)
  })

  it('exposes the notice to assistive tech without stealing focus', () => {
    render(<StoreClosedBanner status={closedStatus()} />)
    expect(screen.getByTestId('store-closed-banner')).toHaveAttribute('role', 'status')
  })
})
