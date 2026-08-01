/**
 * "Which branch?" as its own screen under the `after` timing.
 *
 * The inline card list is replaced by the same full-screen picker the `before`
 * splash uses, so a customer meets one consistent branch screen whichever
 * timing the merchant chose. It takes over checkout until the question is
 * answered, then hands over to the normal form.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { CheckoutOutletScreen } from '@/components/customer/checkout-templates/checkout-outlet-screen'
import { CheckoutOutletSummary } from '@/components/customer/checkout-templates/checkout-outlet-section'
import type { UseCheckoutOutletResult } from '@/hooks/use-checkout-outlet'
import type { Outlet } from '@/types/database'

const ranked = (id: string, name: string) => ({
  outlet: {
    id,
    name,
    slug: name.toLowerCase(),
    address: `${name} Road`,
    image_url: null,
    operating_hours: null,
    timezone: null,
    is_active: true,
    sort_order: 0,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: true,
  } as unknown as Outlet,
  distanceKm: null,
  withinDeliveryRadius: true,
})

const outletState = (
  overrides: Partial<UseCheckoutOutletResult> = {}
): UseCheckoutOutletResult => ({
  isPickerVisible: true,
  choices: [ranked('o-cainta', 'Cainta'), ranked('o-makati', 'Makati')],
  selectedOutletId: null,
  select: jest.fn(),
  clearSelection: jest.fn(),
  mode: 'pickup',
  isMissingRequiredSelection: true,
  ...overrides,
})

describe('CheckoutOutletScreen', () => {
  it('shows every offered branch on a screen of its own', () => {
    render(<CheckoutOutletScreen outlet={outletState()} />)

    expect(screen.getByText('Cainta')).toBeInTheDocument()
    expect(screen.getByText('Makati')).toBeInTheDocument()
  })

  it('hands the chosen branch back and lets checkout continue', () => {
    const select = jest.fn()
    render(<CheckoutOutletScreen outlet={outletState({ select })} />)

    fireEvent.click(screen.getByText('Makati'))

    expect(select).toHaveBeenCalledWith('o-makati')
  })

  it('renders nothing once the branch question is answered', () => {
    const { container } = render(
      <CheckoutOutletScreen
        outlet={outletState({ selectedOutletId: 'o-makati', isMissingRequiredSelection: false })}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a tenant with no branch question to ask', () => {
    const { container } = render(
      <CheckoutOutletScreen
        outlet={outletState({ isPickerVisible: false, isMissingRequiredSelection: false })}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})

describe('CheckoutOutletSummary', () => {
  it('names the chosen branch inside the checkout form', () => {
    render(
      <CheckoutOutletSummary
        outlet={outletState({ selectedOutletId: 'o-makati', isMissingRequiredSelection: false })}
      />
    )

    expect(screen.getByText('Makati')).toBeInTheDocument()
  })

  it('reopens the branch screen when the customer wants a different one', () => {
    const clearSelection = jest.fn()
    render(
      <CheckoutOutletSummary
        outlet={outletState({
          selectedOutletId: 'o-makati',
          isMissingRequiredSelection: false,
          clearSelection,
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /change/i }))

    expect(clearSelection).toHaveBeenCalled()
  })

  it('stays hidden while the screen is still asking', () => {
    const { container } = render(<CheckoutOutletSummary outlet={outletState()} />)

    expect(container).toBeEmptyDOMElement()
  })
})
