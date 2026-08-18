/**
 * The menu list says which dishes are not linked to inventory.
 *
 * A dish with no recipe deducts nothing when it sells, and until now no
 * surface a merchant actually visits said so — the live platform has stores
 * with inventory on and not one recipe. The badge names the gap where the
 * merchant already works.
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

function renderList(
  items: MenuItem[],
  props: Partial<Parameters<typeof MenuItemsList>[0]> = {},
) {
  render(
    <MenuItemsList
      items={items}
      categories={CATEGORIES}
      tenantSlug="cafe"
      tenantId="t1"
      {...props}
    />,
  )
}

describe('the inventory link badge on the menu list', () => {
  it('marks a dish with no recipe when inventory is on', () => {
    renderList([item({ id: 'item-1' })], {
      inventoryEnabled: true,
      recipeLinkedItemIds: [],
    })

    expect(screen.getByText(/not linked to inventory/i)).toBeInTheDocument()
  })

  it('says nothing about a dish whose recipe exists', () => {
    renderList([item({ id: 'item-1' })], {
      inventoryEnabled: true,
      recipeLinkedItemIds: ['item-1'],
    })

    expect(screen.queryByText(/not linked to inventory/i)).not.toBeInTheDocument()
  })

  it('says nothing at all when the tenant has no inventory', () => {
    renderList([item({ id: 'item-1' })])

    expect(screen.queryByText(/not linked to inventory/i)).not.toBeInTheDocument()
  })

  it('withholds the verdict when the recipe read failed — an unknown must not read as an accusation', () => {
    renderList([item({ id: 'item-1' })], {
      inventoryEnabled: true,
      recipeLinkedItemIds: null,
    })

    expect(screen.queryByText(/not linked to inventory/i)).not.toBeInTheDocument()
  })
})
