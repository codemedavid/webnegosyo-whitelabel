/**
 * The merchant-facing half of `auto_disabled_at`.
 *
 * The column has been written since Phase 5C and read by nothing. On the menu
 * grid an auto-86'd dish and a dish the merchant hid look identical, so the one
 * failure this whole feature can cause — a bestseller silently off the menu —
 * is also the one thing the screen cannot show.
 */

import { render, screen } from '@testing-library/react'
import { MenuItemsList } from '@/components/admin/menu-items-list'
import type { Category, MenuItem } from '@/types/database'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@/app/actions/menu-items', () => ({
  deleteMenuItemAction: jest.fn(),
  toggleAvailabilityAction: jest.fn(),
}))

function item(overrides: Partial<MenuItem>): MenuItem {
  return {
    id: 'item-1',
    tenant_id: 't1',
    category_id: 'cat-1',
    name: 'Carbonara',
    description: 'Creamy pasta',
    price: 250,
    image_url: '',
    is_available: true,
    is_featured: false,
    order: 0,
    ...overrides,
  } as MenuItem
}

const CATEGORIES: Category[] = [
  { id: 'cat-1', tenant_id: 't1', name: 'Pasta', order: 0 } as Category,
]

function renderList(items: MenuItem[]) {
  render(
    <MenuItemsList items={items} categories={CATEGORIES} tenantSlug="cafe" tenantId="t1" />,
  )
}

describe('a dish auto-86 took off the menu', () => {
  it('says it is out of stock, not merely hidden', () => {
    renderList([item({ is_available: false, auto_disabled_at: '2026-07-27T10:00:00Z' })])

    expect(screen.getByText('Out of stock')).toBeInTheDocument()
  })

  it('leaves a dish the merchant hid unlabelled, so the two are distinguishable', () => {
    renderList([item({ is_available: false, auto_disabled_at: null })])

    expect(screen.queryByText('Out of stock')).not.toBeInTheDocument()
  })

  it('says nothing about stock for a dish that is on sale', () => {
    renderList([item({ is_available: true, auto_disabled_at: null })])

    expect(screen.queryByText('Out of stock')).not.toBeInTheDocument()
  })

  it('labels only the dishes the system pulled when both kinds are listed', () => {
    renderList([
      item({ id: 'a', name: 'Carbonara', is_available: false, auto_disabled_at: '2026-07-27T10:00:00Z' }),
      item({ id: 'b', name: 'Tiramisu', is_available: false, auto_disabled_at: null }),
    ])

    expect(screen.getAllByText('Out of stock')).toHaveLength(1)
  })
})
