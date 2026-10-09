import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { Outlet, Tenant } from '@/types/database'

/**
 * A customer who already chose a branch and then refreshes (or comes back
 * another day) sees the branch list again with their branch marked as the
 * current one — one tap continues, another tap switches. Moving around inside
 * the storefront (menu → cart → menu) must NOT ask again: the list is offered
 * once per page load, never on every mount of the menu.
 */

let mockSearch = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearch,
}))
const mockSetOrderType = jest.fn()
jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({ setOrderType: mockSetOrderType }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => {
        const chain = {
          eq: () => chain,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        }
        return chain
      },
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

const OUTLETS = [
  makeOutlet({ id: 'a', name: 'Cainta', sort_order: 0 }),
  makeOutlet({ id: 'b', name: 'Makati', sort_order: 1 }),
]
const TENANT = { id: 't1', name: 'ZUS Coffee', multi_branch_enabled: true } as Tenant
const STORAGE_KEY = 'selected_outlet_zus'

const remember = (outletId: string, mode: string | null) =>
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ outletId, mode, savedAt: Date.now() }))

const storedOutletId = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}').outletId

// Imported lazily: next/jest leaves static imports ahead of jest.mock.
const loadGate = async () => {
  const { OutletGate } = await import('@/components/customer/outlet-gate')
  const { resetBranchRevisitForTests } = await import('@/lib/outlets/branch-revisit')
  return { OutletGate, resetBranchRevisitForTests }
}

describe('OutletGate — returning to a remembered branch', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    mockSearch = new URLSearchParams()
    mockSetOrderType.mockClear()
    const { resetBranchRevisitForTests } = await loadGate()
    resetBranchRevisitForTests()
  })

  it('shows the branch list on a fresh load with the remembered branch marked current', async () => {
    // Arrange
    remember('b', 'pickup')
    const { OutletGate } = await loadGate()

    // Act
    render(<OutletGate tenant={TENANT} tenantSlug="zus" outlets={OUTLETS} />)

    // Assert — straight to the branches, not the order-type tiles
    expect(await screen.findByText('Select Your Outlet')).toBeInTheDocument()
    expect(screen.getByText('Current branch')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Makati.*current branch/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Cainta/ })).toBeInTheDocument()
  })

  it('lists the current branch first', async () => {
    remember('b', 'pickup')
    const { OutletGate } = await loadGate()

    render(<OutletGate tenant={TENANT} tenantSlug="zus" outlets={OUTLETS} />)

    await screen.findByText('Select Your Outlet')
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? '')
      .filter((label) => /Cainta|Makati/.test(label))
    expect(names[0]).toMatch(/Makati/)
  })

  it('tapping the current branch continues to the menu and keeps the choice', async () => {
    remember('b', 'pickup')
    const { OutletGate } = await loadGate()
    const { container } = render(<OutletGate tenant={TENANT} tenantSlug="zus" outlets={OUTLETS} />)

    fireEvent.click(await screen.findByRole('button', { name: /Makati.*current branch/i }))

    expect(container).toBeEmptyDOMElement()
    expect(storedOutletId()).toBe('b')
    expect(mockSetOrderType).not.toHaveBeenCalled()
  })

  it('tapping another branch switches to it', async () => {
    remember('b', 'pickup')
    const { OutletGate } = await loadGate()
    const { container } = render(<OutletGate tenant={TENANT} tenantSlug="zus" outlets={OUTLETS} />)

    fireEvent.click(await screen.findByRole('button', { name: /^Cainta/ }))

    expect(container).toBeEmptyDOMElement()
    expect(storedOutletId()).toBe('a')
  })

  it('does not ask again when the menu mounts a second time in the same page load', async () => {
    remember('b', 'pickup')
    const { OutletGate } = await loadGate()
    const first = render(<OutletGate tenant={TENANT} tenantSlug="zus" outlets={OUTLETS} />)
    fireEvent.click(await screen.findByRole('button', { name: /Makati.*current branch/i }))
    first.unmount()

    // Client-side navigation back to the menu remounts the gate.
    const { container } = render(<OutletGate tenant={TENANT} tenantSlug="zus" outlets={OUTLETS} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('does not ask when a branch link named the branch', async () => {
    remember('b', 'pickup')
    mockSearch = new URLSearchParams('outlet=a')
    const { OutletGate } = await loadGate()

    const { container } = render(<OutletGate tenant={TENANT} tenantSlug="zus" outlets={OUTLETS} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('does not ask on a table QR link', async () => {
    remember('b', 'pickup')
    mockSearch = new URLSearchParams('table=5')
    const { OutletGate } = await loadGate()

    const { container } = render(<OutletGate tenant={TENANT} tenantSlug="zus" outlets={OUTLETS} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('a first-time visitor still starts at the order-type tiles', async () => {
    const { OutletGate } = await loadGate()

    render(<OutletGate tenant={TENANT} tenantSlug="zus" outlets={OUTLETS} />)

    expect(await screen.findByText('How would you like your order?')).toBeInTheDocument()
    expect(screen.queryByText('Current branch')).not.toBeInTheDocument()
  })
})
