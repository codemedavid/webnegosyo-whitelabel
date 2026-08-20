/**
 * Checkout is the last line of defense against an order that belongs to no
 * branch — under BOTH timings.
 *
 * Under `before` timing the splash chooser is supposed to have answered the
 * question, but nothing guarantees it did: the customer may have landed
 * straight on checkout from a shared link, localStorage may have expired or
 * been wiped, or a `/b/{slug}` QR link may have satisfied the menu gate
 * without ever writing the stored selection. In each of those cases checkout
 * used to submit with no branch at all, and the order surfaced as
 * "Unassigned" in the merchant's dashboard.
 *
 * These tests pin the safety net: a multi-branch tenant's checkout must
 * either know the branch or ask for it, whichever timing the merchant chose.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useCheckoutOutlet } from '@/hooks/use-checkout-outlet'
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

const ORDER_TYPES = [
  { id: 'ot-delivery', name: 'Deliver to me', type: 'delivery' },
] as unknown as OrderType[]

const CAINTA = outlet({ id: 'o-cainta', name: 'Cainta' })
const MAKATI = outlet({ id: 'o-makati', name: 'Makati', sort_order: 1 })

const BEFORE = tenantWith({
  multi_branch_enabled: true,
  outlet_selection_timing: 'before',
} as Partial<Tenant>)

const renderBeforeTimingCheckout = () =>
  renderHook(() =>
    useCheckoutOutlet({
      tenant: BEFORE,
      tenantSlug: 'acme',
      orderTypes: ORDER_TYPES,
      orderTypeId: 'ot-delivery',
    })
  )

beforeEach(() => {
  fetchActiveOutlets.mockReset()
  fetchActiveOutlets.mockResolvedValue([CAINTA, MAKATI])
  window.localStorage.clear()
})

describe('useCheckoutOutlet — before-timing safety net', () => {
  it('blocks the order and offers the branches when the stored choice is gone', async () => {
    // Arrange: nothing in storage — expired TTL, new device, or a direct link.
    const { result } = renderBeforeTimingCheckout()

    // Assert: checkout must ask, not submit an unassigned order.
    await waitFor(() => expect(result.current.isMissingRequiredSelection).toBe(true))
    await waitFor(() => expect(fetchActiveOutlets).toHaveBeenCalledWith('tenant-1'))
    await waitFor(() =>
      expect(result.current.choices.map((c) => c.outlet.id)).toEqual(['o-cainta', 'o-makati'])
    )
    expect(result.current.selectedOutletId).toBeNull()
  })

  it('attributes the order to the branch the QR link named', async () => {
    // Arrange: a /b/{slug} arrival wrote only the linked slug, never the
    // stored selection — the gap that used to drop the branch at checkout.
    window.localStorage.setItem(
      'linked_outlet_acme',
      JSON.stringify({ slug: 'makati', savedAt: Date.now() })
    )

    const { result } = renderBeforeTimingCheckout()

    // Assert: the named branch takes the order; nothing blocks the customer.
    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-makati'))
    expect(result.current.isMissingRequiredSelection).toBe(false)
  })

  it('accepts the branch tapped on the fallback picker and lifts the block', async () => {
    const { result } = renderBeforeTimingCheckout()

    await waitFor(() => expect(result.current.isMissingRequiredSelection).toBe(true))
    await waitFor(() => expect(result.current.choices.length).toBe(2))

    act(() => result.current.select('o-cainta'))

    expect(result.current.selectedOutletId).toBe('o-cainta')
    expect(result.current.isMissingRequiredSelection).toBe(false)
  })

  it('auto-picks the only branch rather than blocking or dropping it', async () => {
    fetchActiveOutlets.mockResolvedValue([CAINTA])

    const { result } = renderBeforeTimingCheckout()

    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-cainta'))
    expect(result.current.isMissingRequiredSelection).toBe(false)
  })

  it('still trusts a stored splash choice without fetching anything', async () => {
    window.localStorage.setItem(
      'selected_outlet_acme',
      JSON.stringify({ outletId: 'o-makati', mode: 'delivery', savedAt: Date.now() })
    )

    const { result } = renderBeforeTimingCheckout()

    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-makati'))
    expect(result.current.isMissingRequiredSelection).toBe(false)
    expect(fetchActiveOutlets).not.toHaveBeenCalled()
  })

  it('degrades to a branchless checkout for a tenant with no branches yet', async () => {
    fetchActiveOutlets.mockResolvedValue([])

    const { result } = renderBeforeTimingCheckout()

    await waitFor(() => expect(fetchActiveOutlets).toHaveBeenCalled())
    await waitFor(() => expect(result.current.isMissingRequiredSelection).toBe(false))
    expect(result.current.selectedOutletId).toBeNull()
  })
})
