/**
 * What the merchant's switch is called now that it no longer hides anything.
 *
 * The toggle used to read "Hidden", which was accurate: the dish was removed
 * from the customer's menu. It now stays listed and marked unavailable, so
 * "Hidden" describes something the button no longer does — a merchant reading
 * it would think a discontinued dish was safely off their public menu.
 *
 * The auto-86 badge keeps a distinct wording. Both states mean "customers
 * cannot order this", but only one of them is a decision the merchant made,
 * and telling those apart is the entire reason `auto_disabled_at` exists.
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
    name: 'Lechon Kawali',
    description: 'Crispy pork belly',
    price: 280,
    image_url: '',
    is_available: true,
    is_featured: false,
    order: 0,
    ...overrides,
  } as MenuItem
}

const CATEGORIES: Category[] = [
  { id: 'cat-1', tenant_id: 't1', name: 'Mains', order: 0 } as Category,
]

function renderList(items: MenuItem[]) {
  render(
    <MenuItemsList items={items} categories={CATEGORIES} tenantSlug="cafe" tenantId="t1" />,
  )
}

describe('the availability switch in menu management', () => {
  it('says "Out of stock" for a dish the merchant switched off', () => {
    renderList([item({ is_available: false, auto_disabled_at: null })])

    expect(screen.getByRole('button', { name: /out of stock/i })).toBeInTheDocument()
  })

  it('no longer calls it "Hidden", which is not what it does any more', () => {
    renderList([item({ is_available: false, auto_disabled_at: null })])

    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })

  it('says "Available" for a dish that is in stock', () => {
    renderList([item({ is_available: true })])

    expect(screen.getByRole('button', { name: /available/i })).toBeInTheDocument()
  })
})
