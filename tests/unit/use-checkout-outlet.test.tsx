/**
 * Choosing the branch at checkout ("after" timing).
 *
 * The gate is off in this flow, so checkout is the only place the branch is
 * ever asked for — which makes this hook the whole safety net. It has to fetch
 * branches only for the tenants who opted into this timing, narrow them to the
 * ones that can actually fulfill the chosen order type, and never let a stale
 * selection ride along into an order the branch cannot serve.
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
  { id: 'ot-dine', name: 'Eat here', type: 'dine_in' },
] as unknown as OrderType[]

const CAINTA = outlet({ id: 'o-cainta', name: 'Cainta' })
const MAKATI = outlet({ id: 'o-makati', name: 'Makati', sort_order: 1 })
const DINE_ONLY = outlet({
  id: 'o-dine',
  name: 'Kiosk',
  sort_order: 2,
  supports_pickup: false,
  supports_delivery: false,
  supports_dine_in: true,
})

const AFTER = tenantWith({
  multi_branch_enabled: true,
  outlet_selection_timing: 'after',
} as Partial<Tenant>)

beforeEach(() => {
  fetchActiveOutlets.mockReset()
  fetchActiveOutlets.mockResolvedValue([CAINTA, MAKATI])
  window.localStorage.clear()
})

describe('useCheckoutOutlet', () => {
  it('shows the picker and lists every branch that can fulfill the order type', async () => {
    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: AFTER,
        tenantSlug: 'acme',
        orderTypes: ORDER_TYPES,
        orderTypeId: 'ot-delivery',
      })
    )

    await waitFor(() => expect(result.current.isPickerVisible).toBe(true))
    expect(result.current.choices.map((c) => c.outlet.id)).toEqual(['o-cainta', 'o-makati'])
    expect(result.current.selectedOutletId).toBeNull()
    expect(result.current.isMissingRequiredSelection).toBe(true)
  })

  it('does not fetch branches at all when the tenant asks before the menu', async () => {
    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: tenantWith({
          multi_branch_enabled: true,
          outlet_selection_timing: 'before',
        } as Partial<Tenant>),
        tenantSlug: 'acme',
        orderTypes: ORDER_TYPES,
        orderTypeId: 'ot-delivery',
      })
    )

    await waitFor(() => expect(result.current.isPickerVisible).toBe(false))
    expect(fetchActiveOutlets).not.toHaveBeenCalled()
  })

  it('does not fetch branches when the tenant has multi-branch turned off', async () => {
    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: tenantWith({ multi_branch_enabled: false } as Partial<Tenant>),
        tenantSlug: 'acme',
        orderTypes: ORDER_TYPES,
        orderTypeId: 'ot-delivery',
      })
    )

    await waitFor(() => expect(result.current.isPickerVisible).toBe(false))
    expect(fetchActiveOutlets).not.toHaveBeenCalled()
  })

  it('stays out of the way when only one branch is active', async () => {
    fetchActiveOutlets.mockResolvedValue([CAINTA])

    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: AFTER,
        tenantSlug: 'acme',
        orderTypes: ORDER_TYPES,
        orderTypeId: 'ot-delivery',
      })
    )

    await waitFor(() => expect(fetchActiveOutlets).toHaveBeenCalled())
    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-cainta'))
    expect(result.current.isPickerVisible).toBe(false)
    expect(result.current.isMissingRequiredSelection).toBe(false)
  })

  it('records the customer choice and clears the missing-selection block', async () => {
    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: AFTER,
        tenantSlug: 'acme',
        orderTypes: ORDER_TYPES,
        orderTypeId: 'ot-delivery',
      })
    )

    await waitFor(() => expect(result.current.isPickerVisible).toBe(true))
    act(() => result.current.select('o-makati'))

    expect(result.current.selectedOutletId).toBe('o-makati')
    expect(result.current.isMissingRequiredSelection).toBe(false)
  })

  it('drops a chosen branch that the newly chosen order type cannot fulfill', async () => {
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

    await waitFor(() => expect(result.current.isPickerVisible).toBe(true))
    act(() => result.current.select('o-dine'))
    expect(result.current.selectedOutletId).toBe('o-dine')

    rerender({ orderTypeId: 'ot-delivery' })

    expect(result.current.choices.map((c) => c.outlet.id)).toEqual(['o-cainta', 'o-makati'])
    expect(result.current.selectedOutletId).toBeNull()
    expect(result.current.isMissingRequiredSelection).toBe(true)
  })

  it('reuses the branch the customer already picked before the menu', async () => {
    window.localStorage.setItem(
      'selected_outlet_acme',
      JSON.stringify({ outletId: 'o-makati', mode: 'delivery', savedAt: Date.now() })
    )

    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: tenantWith({
          multi_branch_enabled: true,
          outlet_selection_timing: 'before',
        } as Partial<Tenant>),
        tenantSlug: 'acme',
        orderTypes: ORDER_TYPES,
        orderTypeId: 'ot-delivery',
      })
    )

    await waitFor(() => expect(result.current.selectedOutletId).toBe('o-makati'))
    expect(result.current.isPickerVisible).toBe(false)
    expect(fetchActiveOutlets).not.toHaveBeenCalled()
  })

  it('leaves single-location tenants with no branch on the order', async () => {
    const { result } = renderHook(() =>
      useCheckoutOutlet({
        tenant: tenantWith({ multi_branch_enabled: false } as Partial<Tenant>),
        tenantSlug: 'acme',
        orderTypes: ORDER_TYPES,
        orderTypeId: 'ot-delivery',
      })
    )

    await waitFor(() => expect(result.current.isPickerVisible).toBe(false))
    expect(result.current.selectedOutletId).toBeNull()
    expect(result.current.isMissingRequiredSelection).toBe(false)
  })
})
