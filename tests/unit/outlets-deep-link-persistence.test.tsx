/**
 * A branch QR link has to survive the walk to checkout.
 *
 * `/b/{slug}` is a redirect onto `/{tenant}/menu?outlet={slug}` and nothing
 * more, so the branch it names lives entirely in that one URL. Cart and
 * checkout are separate routes with no query string, which means anything that
 * only reads `?outlet=` during the menu render forgets the branch the moment
 * the customer taps "Cart" — and a merchant who printed a per-branch QR code
 * still gets asked, at checkout, which branch the customer is standing in.
 *
 * These tests pin the handoff: the storefront persists the branch the link
 * named, and checkout's picker starts from it under the "after" timing.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { useOutletSelection } from '@/hooks/use-outlet-selection'
import { useCheckoutOutlet } from '@/hooks/use-checkout-outlet'
import { readLinkedOutletSlug, writeLinkedOutletSlug } from '@/lib/outlets/linked-outlet'
import type { SelectableOutlet } from '@/lib/outlets/outlet-selection'
import type { OrderType, Outlet, Tenant } from '@/types/database'

let urlSlug: string | null = null

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(urlSlug === null ? '' : `outlet=${urlSlug}`),
}))

const fetchActiveOutlets = jest.fn()

jest.mock('@/lib/outlets/outlets-client', () => ({
  fetchActiveOutlets: (...args: unknown[]) => fetchActiveOutlets(...args),
}))

const outlet = (id: string, slug: string, sortOrder: number): SelectableOutlet & Outlet =>
  ({
    id,
    tenant_id: 'tenant-1',
    slug,
    name: slug,
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
    sort_order: sortOrder,
    created_at: '',
    updated_at: '',
  }) as unknown as SelectableOutlet & Outlet

const CAINTA = outlet('o-cainta', 'cainta', 0)
const MAKATI = outlet('o-makati', 'makati', 1)

const AFTER_TENANT = {
  id: 'tenant-1',
  slug: 'acme',
  name: 'Acme',
  multi_branch_enabled: true,
  outlet_selection_timing: 'after',
} as unknown as Tenant

const ORDER_TYPES = [
  { id: 'ot-delivery', name: 'Deliver to me', type: 'delivery' },
] as unknown as OrderType[]

beforeEach(() => {
  urlSlug = null
  window.localStorage.clear()
  fetchActiveOutlets.mockReset()
  fetchActiveOutlets.mockResolvedValue([CAINTA, MAKATI])
})

describe('the branch a QR link names is remembered', () => {
  it('persists the linked branch when the menu opens with ?outlet=', async () => {
    // Arrange: the customer scans the Cainta QR code at the counter.
    urlSlug = 'cainta'

    // Act
    const { result } = renderHook(() =>
      useOutletSelection({ isEnabled: true, tenantSlug: 'acme', outlets: [CAINTA, MAKATI] })
    )

    // Assert: the menu serves Cainta, and the choice outlives this page.
    await waitFor(() => expect(result.current.outlet?.id).toBe('o-cainta'))
    await waitFor(() =>
      expect(readLinkedOutletSlug(window.localStorage, 'acme', Date.now())).toBe('cainta')
    )
  })

  it('leaves storage alone when the link names a branch that does not exist', async () => {
    // Arrange: a stale printed code for a branch since deleted.
    urlSlug = 'closed-branch'

    // Act
    const { result } = renderHook(() =>
      useOutletSelection({ isEnabled: true, tenantSlug: 'acme', outlets: [CAINTA, MAKATI] })
    )

    // Assert: the customer is asked, and nothing false is remembered.
    await waitFor(() => expect(result.current.shouldPrompt).toBe(true))
    expect(readLinkedOutletSlug(window.localStorage, 'acme', Date.now())).toBeNull()
  })

  it('does not remember a branch for a tenant that never turned branches on', async () => {
    // Arrange
    urlSlug = 'cainta'

    // Act
    renderHook(() =>
      useOutletSelection({ isEnabled: false, tenantSlug: 'acme', outlets: [CAINTA, MAKATI] })
    )

    // Assert
    await waitFor(() => expect(window.localStorage.length).toBe(0))
  })
})

describe('checkout starts from the branch the link named', () => {
  it('pre-selects the linked branch instead of asking again', async () => {
    // Arrange: the customer arrived via /b/cainta, then walked to checkout.
    writeLinkedOutletSlug(window.localStorage, 'acme', 'cainta', Date.now())

    // Act
    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: AFTER_TENANT,
        tenantSlug: 'acme',
        orderTypes: ORDER_TYPES,
        orderTypeId: 'ot-delivery',
      })
    )

    // Assert
    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-cainta'))
    expect(result.current.isMissingRequiredSelection).toBe(false)
  })

  it('still asks when the linked branch is no longer on offer', async () => {
    // Arrange: the printed branch has since been deactivated.
    writeLinkedOutletSlug(window.localStorage, 'acme', 'closed-branch', Date.now())

    // Act
    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: AFTER_TENANT,
        tenantSlug: 'acme',
        orderTypes: ORDER_TYPES,
        orderTypeId: 'ot-delivery',
      })
    )

    // Assert
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.selectedOutletId).toBeNull()
    expect(result.current.isMissingRequiredSelection).toBe(true)
  })

  it('lets the customer override the linked branch', async () => {
    // Arrange
    writeLinkedOutletSlug(window.localStorage, 'acme', 'cainta', Date.now())
    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: AFTER_TENANT,
        tenantSlug: 'acme',
        orderTypes: ORDER_TYPES,
        orderTypeId: 'ot-delivery',
      })
    )
    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-cainta'))

    // Act
    result.current.select('o-makati')

    // Assert
    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-makati'))
  })
})
