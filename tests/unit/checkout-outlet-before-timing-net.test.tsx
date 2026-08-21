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

  it('keeps a stored splash choice once it has been validated', async () => {
    window.localStorage.setItem(
      'selected_outlet_acme',
      JSON.stringify({ outletId: 'o-makati', mode: 'delivery', savedAt: Date.now() })
    )

    const { result } = renderBeforeTimingCheckout()

    // The choice survives the validation, and nothing is asked of the customer.
    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-makati'))
    expect(result.current.isMissingRequiredSelection).toBe(false)
    expect(fetchActiveOutlets).toHaveBeenCalled()
  })

  /**
   * A stored branch is a claim from a previous visit, not a fact. Until the live
   * list has come back there is no evidence it still exists, so honouring it
   * "provisionally" means a branch the merchant deleted can be submitted by a
   * customer who taps through faster than the network — landing the order on a
   * branch the server cannot resolve, i.e. Unassigned. The very thing this
   * safety net exists to prevent, through a narrower door.
   */
  it('will not submit a stored branch while it is still unvalidated', async () => {
    window.localStorage.setItem(
      'selected_outlet_acme',
      JSON.stringify({ outletId: 'o-ghost', mode: 'delivery', savedAt: Date.now() })
    )

    // Arrange: hold the branch list in flight so the pre-validation render is
    // observable, exactly as a slow mobile connection would leave it.
    let releaseOutlets: (rows: Outlet[]) => void = () => {}
    fetchActiveOutlets.mockReturnValue(
      new Promise<Outlet[]>((resolve) => {
        releaseOutlets = resolve
      })
    )

    const { result } = renderBeforeTimingCheckout()

    // Assert: mid-flight, the order must be held rather than carry the claim.
    await waitFor(() => expect(fetchActiveOutlets).toHaveBeenCalledWith('tenant-1'))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.selectedOutletId).toBeNull()
    expect(result.current.isMissingRequiredSelection).toBe(true)

    // And once the list lands, the dead branch is refused for good.
    await act(async () => {
      releaseOutlets([CAINTA, MAKATI])
    })

    expect(result.current.selectedOutletId).not.toBe('o-ghost')
    expect(result.current.isMissingRequiredSelection).toBe(true)
  })

  /**
   * The menu already ruled on this: "the URL wins over anything stored". It
   * resolves a `/b/{slug}` arrival to the branch the link named and pointedly
   * does NOT overwrite the older stored choice. If checkout then prefers the
   * stored one, the customer browses and is priced at one branch and the order
   * is placed at another — per-branch pricing makes that a money bug.
   */
  it('prefers the branch a QR link named over an older stored choice', async () => {
    window.localStorage.setItem(
      'selected_outlet_acme',
      JSON.stringify({ outletId: 'o-cainta', mode: 'delivery', savedAt: Date.now() })
    )
    window.localStorage.setItem(
      'linked_outlet_acme',
      JSON.stringify({ slug: 'makati', savedAt: Date.now() })
    )

    const { result } = renderBeforeTimingCheckout()

    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-makati'))
    expect(result.current.isMissingRequiredSelection).toBe(false)
  })

  it('drops a stored branch the merchant has since deactivated and asks again', async () => {
    // Arrange: the splash stored a branch that no longer exists in the live
    // list — deactivated or deleted after the customer chose it.
    window.localStorage.setItem(
      'selected_outlet_acme',
      JSON.stringify({ outletId: 'o-ghost', mode: 'delivery', savedAt: Date.now() })
    )

    const { result } = renderBeforeTimingCheckout()

    // Assert: the dead branch must not take the order; the customer is asked.
    await waitFor(() => expect(result.current.isMissingRequiredSelection).toBe(true))
    await waitFor(() =>
      expect(result.current.choices.map((c) => c.outlet.id)).toEqual(['o-cainta', 'o-makati'])
    )
    expect(result.current.selectedOutletId).not.toBe('o-ghost')
  })

  it('degrades to a branchless checkout for a tenant with no branches yet', async () => {
    fetchActiveOutlets.mockResolvedValue([])

    const { result } = renderBeforeTimingCheckout()

    await waitFor(() => expect(fetchActiveOutlets).toHaveBeenCalled())
    await waitFor(() => expect(result.current.isMissingRequiredSelection).toBe(false))
    expect(result.current.selectedOutletId).toBeNull()
  })
})
