/**
 * The branch picker checkout renders under the "after" timing.
 *
 * Rendered by the checkout page shell, so every checkout design gets it without
 * five copies of the same markup. It must be completely absent for every tenant
 * the hook says has nothing to ask.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { CheckoutOutletSection } from '@/components/customer/checkout-templates/checkout-outlet-section'
import type { UseCheckoutOutletResult } from '@/hooks/use-checkout-outlet'
import type { Outlet } from '@/types/database'

const ranked = (id: string, name: string, address: string | null = null) => ({
  outlet: { id, name, address } as unknown as Outlet,
  distanceKm: null,
  withinDeliveryRadius: false,
})

const outletState = (
  overrides: Partial<UseCheckoutOutletResult> = {}
): UseCheckoutOutletResult => ({
  isPickerVisible: true,
  choices: [ranked('o-cainta', 'Cainta', '12 Ortigas Ext'), ranked('o-makati', 'Makati')],
  selectedOutletId: null,
  select: jest.fn(),
  isMissingRequiredSelection: true,
  ...overrides,
})

describe('CheckoutOutletSection', () => {
  it('lists every branch the customer can order from', () => {
    render(<CheckoutOutletSection outlet={outletState()} />)

    expect(screen.getByText('Cainta')).toBeInTheDocument()
    expect(screen.getByText('Makati')).toBeInTheDocument()
    expect(screen.getByText('12 Ortigas Ext')).toBeInTheDocument()
  })

  it('renders nothing when the tenant has no branch question to ask', () => {
    const { container } = render(
      <CheckoutOutletSection outlet={outletState({ isPickerVisible: false })} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('reports the customer choice to the hook', () => {
    const select = jest.fn()
    render(<CheckoutOutletSection outlet={outletState({ select })} />)

    fireEvent.click(screen.getByText('Makati'))

    expect(select).toHaveBeenCalledWith('o-makati')
  })

  it('marks the chosen branch as pressed for assistive technology', () => {
    render(<CheckoutOutletSection outlet={outletState({ selectedOutletId: 'o-makati' })} />)

    const chosen = screen.getByRole('button', { name: /Makati/ })
    expect(chosen).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Cainta/ })).toHaveAttribute('aria-pressed', 'false')
  })
})
