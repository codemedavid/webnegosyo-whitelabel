/**
 * Hardening the "pick the branch at checkout" journey.
 *
 * The happy path already has coverage. These are the ways it currently goes
 * wrong, all of which end in one of two bad places: an order that belongs to no
 * branch, or a customer stranded on a screen that will not explain itself.
 *
 *  1. Branches are still loading, so nothing asks and the CTA is live.
 *  2. No branch can serve the chosen order type, so nothing asks and the CTA is
 *     live — the picker only appears when there are two or more choices.
 *  3. The screen reads the wall clock during render, so the open/closed label
 *     can differ between the server render and hydration.
 *  4. The screen offers a "Use my location" button wired to a no-op.
 *  5. Changing the order type silently drops a branch that can no longer serve
 *     it and throws the customer back to the picker with no explanation.
 *  6. A branch's open/closed state is announced outside its own tap target, so
 *     a screen reader user hears the name and nothing else.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useCheckoutOutlet } from '@/hooks/use-checkout-outlet'
import { CheckoutOutletScreen } from '@/components/customer/checkout-templates/checkout-outlet-screen'
import type { UseCheckoutOutletResult } from '@/hooks/use-checkout-outlet'
import type { Outlet, OrderType, Tenant } from '@/types/database'

const fetchActiveOutlets = jest.fn()

jest.mock('@/lib/outlets/outlets-client', () => ({
  fetchActiveOutlets: (...args: unknown[]) => fetchActiveOutlets(...args),
}))

const outlet = (overrides: Partial<Outlet> & { id: string; name: string }): Outlet =>
  ({
    tenant_id: 'tenant-1',
    slug: overrides.name.toLowerCase(),
    address: null,
    latitude: null,
    longitude: null,
    phone: null,
    operating_hours: null,
    timezone: null,
    image_url: null,
    delivery_radius_km: null,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: true,
    is_active: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  }) as unknown as Outlet

const tenantWith = (fields: Partial<Tenant>): Tenant =>
  ({ id: 'tenant-1', slug: 'acme', name: 'Acme', ...fields }) as unknown as Tenant

const AFTER = tenantWith({
  multi_branch_enabled: true,
  outlet_selection_timing: 'after',
} as Partial<Tenant>)

const ORDER_TYPES = [
  { id: 'ot-delivery', name: 'Deliver to me', type: 'delivery' },
  { id: 'ot-dine', name: 'Eat here', type: 'dine_in' },
] as unknown as OrderType[]

const CAINTA = outlet({ id: 'o-cainta', name: 'Cainta' })
const MAKATI = outlet({ id: 'o-makati', name: 'Makati', sort_order: 1 })

/** Seats customers, but will not hand food out or drive it anywhere. */
const DINE_ONLY = outlet({
  id: 'o-dine',
  name: 'Kiosk',
  supports_pickup: false,
  supports_delivery: false,
  supports_dine_in: true,
})

const renderCheckoutOutlet = (orderTypeId: string | null, tenant: Tenant = AFTER) =>
  renderHook(() =>
    useCheckoutOutlet({ tenant, tenantSlug: 'acme', orderTypes: ORDER_TYPES, orderTypeId })
  )

beforeEach(() => {
  fetchActiveOutlets.mockReset()
  fetchActiveOutlets.mockResolvedValue([CAINTA, MAKATI])
  window.localStorage.clear()
})

describe('an order can never be placed against no branch', () => {
  it('holds the order while the branches are still loading', async () => {
    // A fetch that has not settled is exactly the window a fast thumb hits.
    let release: (rows: Outlet[]) => void = () => {}
    fetchActiveOutlets.mockReturnValue(
      new Promise<Outlet[]>((resolve) => {
        release = resolve
      })
    )

    const { result } = renderCheckoutOutlet('ot-dine')

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isMissingRequiredSelection).toBe(true)

    release([CAINTA, MAKATI])
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('holds the order when no branch can serve the chosen order type', async () => {
    // One branch, dine-in only. A delivery order has nowhere to go, and the
    // "two or more choices" rule means nothing is asked at all today.
    fetchActiveOutlets.mockResolvedValue([DINE_ONLY])

    const { result } = renderCheckoutOutlet('ot-delivery')

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.choices).toHaveLength(0)
    expect(result.current.selectedOutletId).toBeNull()
    expect(result.current.isMissingRequiredSelection).toBe(true)
  })

  it('still degrades to a plain checkout for a tenant with no branches at all', async () => {
    // The flag is on but nothing has been set up yet. Blocking here would
    // strand the customer on a screen with nothing on it to choose.
    fetchActiveOutlets.mockResolvedValue([])

    const { result } = renderCheckoutOutlet('ot-dine')

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isMissingRequiredSelection).toBe(false)
    expect(result.current.selectedOutletId).toBeNull()
  })

  it('never blocks a single-location tenant, which does no fetch at all', () => {
    const { result } = renderCheckoutOutlet('ot-dine', tenantWith({}))

    expect(fetchActiveOutlets).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isMissingRequiredSelection).toBe(false)
  })
})

describe('changing the order type explains itself', () => {
  it('reports why a branch was dropped when the order type outgrew it', async () => {
    // Two delivery-capable branches, so dropping the kiosk leaves a real
    // choice rather than a single branch the resolver would auto-pick.
    fetchActiveOutlets.mockResolvedValue([CAINTA, MAKATI, DINE_ONLY])

    const { result, rerender } = renderHook(
      ({ orderTypeId }: { orderTypeId: string }) =>
        useCheckoutOutlet({
          tenant: AFTER,
          tenantSlug: 'acme',
          orderTypes: ORDER_TYPES,
          orderTypeId,
        }),
      { initialProps: { orderTypeId: 'ot-dine' } }
    )

    await waitFor(() => expect(result.current.choices).toHaveLength(3))

    // Chose the dine-in-only kiosk, then switched the order to delivery.
    act(() => result.current.select('o-dine'))
    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-dine'))

    rerender({ orderTypeId: 'ot-delivery' })

    await waitFor(() => expect(result.current.selectedOutletId).toBeNull())
    expect(result.current.droppedReason).toBe('order-type-changed')
  })

  it('moves the order to the only branch left, and still says the choice changed', async () => {
    // One delivery-capable branch remains, so there is no question left to ask
    // — but the customer's own pick was overridden and the summary row has to
    // be able to say so rather than quietly renaming the branch.
    fetchActiveOutlets.mockResolvedValue([CAINTA, DINE_ONLY])

    const { result, rerender } = renderHook(
      ({ orderTypeId }: { orderTypeId: string }) =>
        useCheckoutOutlet({
          tenant: AFTER,
          tenantSlug: 'acme',
          orderTypes: ORDER_TYPES,
          orderTypeId,
        }),
      { initialProps: { orderTypeId: 'ot-dine' } }
    )

    await waitFor(() => expect(result.current.choices).toHaveLength(2))
    act(() => result.current.select('o-dine'))
    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-dine'))

    rerender({ orderTypeId: 'ot-delivery' })

    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-cainta'))
    expect(result.current.isMissingRequiredSelection).toBe(false)
    expect(result.current.droppedReason).toBe('order-type-changed')
  })

  it('carries no reason when the customer simply has not chosen yet', async () => {
    const { result } = renderCheckoutOutlet('ot-dine')

    await waitFor(() => expect(result.current.choices).toHaveLength(2))

    expect(result.current.isMissingRequiredSelection).toBe(true)
    expect(result.current.droppedReason).toBeNull()
  })
})

// --- Screen ---------------------------------------------------------------

const ranked = (id: string, name: string, operating_hours: unknown = null) => ({
  outlet: {
    id,
    name,
    slug: name.toLowerCase(),
    address: `${name} Road`,
    image_url: null,
    operating_hours,
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
): UseCheckoutOutletResult =>
  ({
    isPickerVisible: true,
    choices: [ranked('o-cainta', 'Cainta'), ranked('o-makati', 'Makati')],
    selectedOutletId: null,
    select: jest.fn(),
    clearSelection: jest.fn(),
    mode: 'pickup',
    isLoading: false,
    droppedReason: null,
    isMissingRequiredSelection: true,
    ...overrides,
  }) as unknown as UseCheckoutOutletResult

describe('the branch screen at checkout', () => {
  it('offers no location button, because nothing is wired to it', () => {
    render(<CheckoutOutletScreen outlet={outletState()} />)

    expect(screen.queryByLabelText('Use my location')).not.toBeInTheDocument()
  })

  it('says so while the branches are loading, rather than showing an empty list', () => {
    render(<CheckoutOutletScreen outlet={outletState({ isLoading: true, choices: [] })} />)

    expect(screen.getByText(/loading branches/i)).toBeInTheDocument()
  })

  it('explains a dead end instead of showing a blank picker', () => {
    render(
      <CheckoutOutletScreen outlet={outletState({ choices: [], mode: 'delivery' })} />
    )

    expect(screen.getByText(/no branch/i)).toBeInTheDocument()
  })

  it('explains why the branch was dropped when the order type changed', () => {
    render(
      <CheckoutOutletScreen
        outlet={outletState({ droppedReason: 'order-type-changed', mode: 'delivery' })}
      />
    )

    expect(screen.getByText(/no longer/i)).toBeInTheDocument()
  })

  it('reads the clock once, so hydration cannot disagree with the server', () => {
    // Wednesday 2026-07-29, open 09:00–21:00. Mounted a minute before close.
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 6, 29, 20, 59))

    const hours = { '3': { open: '09:00', close: '21:00', closed: false } }
    const state = outletState({ choices: [ranked('o-cainta', 'Cainta', hours)] })

    const { rerender } = render(<CheckoutOutletScreen outlet={state} />)
    expect(screen.getByText('Open')).toBeInTheDocument()

    // Time passes and something unrelated re-renders. A clock read during
    // render would flip the label without the component ever remounting.
    jest.setSystemTime(new Date(2026, 6, 29, 21, 1))
    rerender(<CheckoutOutletScreen outlet={state} />)

    expect(screen.getByText('Open')).toBeInTheDocument()
    jest.useRealTimers()
  })

  it('announces a branch and its status in one accessible name', () => {
    const hours = { '3': { open: '09:00', close: '21:00', closed: false } }
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 6, 29, 22, 0)) // after close

    render(<CheckoutOutletScreen outlet={outletState({ choices: [ranked('o-cainta', 'Cainta', hours)] })} />)

    // The status sits outside the button today, so the button announces only
    // the branch name and a screen reader user cannot tell it is shut.
    expect(screen.getByRole('button', { name: /Cainta.*Closed/i })).toBeInTheDocument()
    jest.useRealTimers()
  })

  it('still hands the chosen branch back', () => {
    const select = jest.fn()
    render(<CheckoutOutletScreen outlet={outletState({ select })} />)

    fireEvent.click(screen.getByRole('button', { name: /Makati/i }))

    expect(select).toHaveBeenCalledWith('o-makati')
  })
})
