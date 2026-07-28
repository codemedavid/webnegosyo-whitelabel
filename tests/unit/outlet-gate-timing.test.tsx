import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { OutletGate } from '@/components/customer/outlet-gate'
import type { Outlet, Tenant } from '@/types/database'

/**
 * The gate's job is to know when NOT to appear.
 *
 * It already stands down for tenants without the flag and for tenants with a
 * single branch. This adds the third case: a merchant who moved the question to
 * checkout must get a menu with nothing over it — otherwise the customer is
 * asked for a branch twice, once here and once at checkout.
 */

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({ setOrderType: jest.fn() }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }),
  }),
}))

function makeOutlet(overrides: Partial<Outlet> & { id: string }): Outlet {
  return {
    tenant_id: 't1',
    slug: overrides.id,
    name: overrides.id,
    address: null,
    image_url: null,
    latitude: null,
    longitude: null,
    phone: null,
    operating_hours: null,
    timezone: 'Asia/Manila',
    delivery_radius_km: null,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: false,
    is_active: true,
    sort_order: 0,
    ...overrides,
  } as Outlet
}

const OUTLETS = [makeOutlet({ id: 'a', name: 'Cainta' }), makeOutlet({ id: 'b', name: 'Makati' })]

const makeTenant = (overrides: Partial<Tenant> = {}): Tenant =>
  ({ id: 't1', name: 'ZUS Coffee', multi_branch_enabled: true, ...overrides }) as Tenant

const renderGate = (tenant: Tenant) =>
  render(<OutletGate tenant={tenant} tenantSlug="zus" outlets={OUTLETS} />)

describe('OutletGate — selection timing', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('covers the menu when the merchant asks for the branch first', () => {
    renderGate(makeTenant({ outlet_selection_timing: 'before' } as Partial<Tenant>))

    expect(screen.getByText('How would you like your order?')).toBeInTheDocument()
  })

  it('still covers the menu for tenants that predate the timing column', () => {
    renderGate(makeTenant())

    expect(screen.getByText('How would you like your order?')).toBeInTheDocument()
  })

  it('renders nothing when the merchant asks for the branch at checkout', () => {
    const { container } = renderGate(
      makeTenant({ outlet_selection_timing: 'after' } as Partial<Tenant>)
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when multi-branch is off, whatever the timing', () => {
    const { container } = renderGate(
      makeTenant({ multi_branch_enabled: false, outlet_selection_timing: 'before' } as Partial<Tenant>)
    )

    expect(container).toBeEmptyDOMElement()
  })
})
