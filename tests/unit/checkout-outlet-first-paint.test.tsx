/**
 * How soon the branch question reaches the screen.
 *
 * Checkout loads in a chain: tenant, then order types, then form fields and
 * payment methods. The branch screen used to sit behind ALL of it, because the
 * page showed `CheckoutLoading` until the very last of those landed — yet the
 * question "which branch?" needs none of the form fields or payment methods.
 * The customer sat watching a spinner before being asked something the app
 * could already have asked.
 *
 * It must not overcorrect either: offering branches before the order type is
 * known means offering branches that cannot serve it, and then yanking the
 * customer's choice away a moment later.
 */

import { render, screen } from '@testing-library/react'
import { renderHook, waitFor } from '@testing-library/react'
import { useCheckoutOutlet } from '@/hooks/use-checkout-outlet'
import type { Outlet, OrderType, Tenant } from '@/types/database'

const fetchActiveOutlets = jest.fn()

jest.mock('@/lib/outlets/outlets-client', () => ({
  fetchActiveOutlets: (...args: unknown[]) => fetchActiveOutlets(...args),
}))

const useCheckout = jest.fn()

jest.mock('@/hooks/useCheckout', () => ({
  useCheckout: (...args: unknown[]) => useCheckout(...args),
}))

jest.mock('next/navigation', () => ({
  useParams: () => ({ tenant: 'acme' }),
}))

// The page's heavy children are irrelevant here; each is stubbed to a marker so
// the test asserts on which screen won, not on what it rendered.
jest.mock('@/components/customer/checkout-templates', () => ({
  CheckoutTemplateRenderer: () => <div>checkout-form</div>,
}))
jest.mock('@/components/customer/checkout-templates/checkout-shared', () => ({
  CheckoutLoading: () => <div>checkout-loading</div>,
  CheckoutNotFound: () => <div>checkout-not-found</div>,
  CheckoutConfirmation: () => <div>checkout-confirmation</div>,
  PaymentDetailsDialog: () => null,
  QrCodeDialog: () => null,
}))
jest.mock('@/components/customer/checkout-templates/checkout-outlet-screen', () => ({
  CheckoutOutletScreen: () => <div>branch-screen</div>,
}))
jest.mock('@/components/customer/checkout-templates/checkout-outlet-section', () => ({
  CheckoutOutletSummary: () => null,
}))
jest.mock('@/components/customer/branding-inspector', () => ({
  BrandingInspector: () => null,
}))

import CheckoutPage from '@/app/[tenant]/checkout/page'

const outletState = (overrides: Record<string, unknown> = {}) => ({
  isPickerVisible: true,
  choices: [],
  selectedOutletId: null,
  select: jest.fn(),
  clearSelection: jest.fn(),
  mode: 'pickup',
  isLoading: false,
  droppedReason: null,
  isMissingRequiredSelection: false,
  ...overrides,
})

const checkoutState = (overrides: Record<string, unknown> = {}) => ({
  isLoading: false,
  tenant: { id: 'tenant-1', checkout_template: 'classic' },
  checkoutComplete: false,
  completedOrderData: null,
  outlet: outletState(),
  ...overrides,
})

describe('the branch screen does not wait for the rest of checkout', () => {
  it('asks for the branch while form fields and payment methods still load', () => {
    // The tenant and its branches are known; the rest of the chain is not.
    useCheckout.mockReturnValue(
      checkoutState({
        isLoading: true,
        outlet: outletState({ isMissingRequiredSelection: true }),
      })
    )

    render(<CheckoutPage />)

    expect(screen.getByText('branch-screen')).toBeInTheDocument()
    expect(screen.queryByText('checkout-loading')).not.toBeInTheDocument()
  })

  it('still shows the ordinary loading screen when no branch is being asked for', () => {
    useCheckout.mockReturnValue(checkoutState({ isLoading: true }))

    render(<CheckoutPage />)

    expect(screen.getByText('checkout-loading')).toBeInTheDocument()
    expect(screen.queryByText('branch-screen')).not.toBeInTheDocument()
  })

  it('never covers a completed order with the branch screen', () => {
    useCheckout.mockReturnValue(
      checkoutState({
        checkoutComplete: true,
        completedOrderData: { id: 'order-1' },
        outlet: outletState({ isMissingRequiredSelection: true }),
      })
    )

    render(<CheckoutPage />)

    expect(screen.getByText('checkout-confirmation')).toBeInTheDocument()
  })
})

// --- Hook -----------------------------------------------------------------

const outlet = (overrides: Partial<Outlet> & { id: string; name: string }): Outlet =>
  ({
    tenant_id: 'tenant-1',
    slug: overrides.name.toLowerCase(),
    address: null,
    latitude: null,
    longitude: null,
    operating_hours: null,
    timezone: null,
    image_url: null,
    delivery_radius_km: null,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: true,
    is_active: true,
    sort_order: 0,
    ...overrides,
  }) as unknown as Outlet

const CAINTA = outlet({ id: 'o-cainta', name: 'Cainta' })
const MAKATI = outlet({ id: 'o-makati', name: 'Makati', sort_order: 1 })

const ORDER_TYPES = [
  { id: 'ot-dine', name: 'Eat here', type: 'dine_in' },
] as unknown as OrderType[]

const AFTER = {
  id: 'tenant-1',
  slug: 'acme',
  multi_branch_enabled: true,
  outlet_selection_timing: 'after',
} as unknown as Tenant

beforeEach(() => {
  fetchActiveOutlets.mockReset()
  fetchActiveOutlets.mockResolvedValue([CAINTA, MAKATI])
  window.localStorage.clear()
})

describe('branches are not offered before the order type that narrows them', () => {
  it('keeps loading until the order types have landed, even once branches have', async () => {
    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: AFTER,
        tenantSlug: 'acme',
        orderTypes: [],
        orderTypeId: null,
        areOrderTypesReady: false,
      })
    )

    // Wait for the branches to actually be in hand, not merely requested —
    // asserting on the pending window would pass without the fix.
    await waitFor(() => expect(result.current.choices).toHaveLength(2))

    // Branches are in hand, but narrowing them is not yet possible. Offering
    // them now risks showing one the order type will immediately rule out.
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isMissingRequiredSelection).toBe(true)
  })

  it('is ready once both the branches and the order types are in', async () => {
    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: AFTER,
        tenantSlug: 'acme',
        orderTypes: ORDER_TYPES,
        orderTypeId: 'ot-dine',
        areOrderTypesReady: true,
      })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.choices).toHaveLength(2)
    expect(result.current.isMissingRequiredSelection).toBe(true)
  })
})
