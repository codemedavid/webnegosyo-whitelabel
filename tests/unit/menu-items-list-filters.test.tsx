/**
 * The menu management toolbar: status chips with live counts, and the
 * pre-order badge on the card of a dish sold per date.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { MenuItemsList } from '@/components/admin/menu-items-list'
import type { Category, MenuItem } from '@/types/database'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@/app/actions/menu-items', () => ({
  deleteMenuItemAction: jest.fn(),
  toggleAvailabilityAction: jest.fn(),
}))

const item = (overrides: Partial<MenuItem>): MenuItem => ({
  id: 'x', tenant_id: 't1', category_id: 'cat-1', name: 'Lechon', description: 'Crispy pork', price: 280,
  image_url: '', is_available: true, is_featured: false, order: 0, ...overrides,
} as MenuItem)

const CATEGORIES: Category[] = [{ id: 'cat-1', tenant_id: 't1', name: 'Mains', order: 0 } as Category]

const ITEMS = [
  item({ id: 'a', name: 'Lechon Kawali' }),
  item({ id: 'b', name: 'Sinigang', is_available: false }),
  item({ id: 'c', name: 'Bibingka', presell_enabled: true }),
]

function renderList(items = ITEMS) {
  render(<MenuItemsList items={items} categories={CATEGORIES} tenantSlug="cafe" tenantId="t1" />)
}

describe('menu management filters', () => {
  it('shows status chips with counts', () => {
    renderList()
    expect(screen.getByRole('tab', { name: /all.*3/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /out of stock.*1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /pre-order.*1/i })).toBeInTheDocument()
  })

  it('narrows the grid when a status chip is chosen', () => {
    renderList()
    fireEvent.click(screen.getByRole('tab', { name: /pre-order/i }))
    expect(screen.getByText('Bibingka')).toBeInTheDocument()
    expect(screen.queryByText('Lechon Kawali')).not.toBeInTheDocument()
  })

  it('wears a pre-order badge on a dish sold per date', () => {
    renderList()
    expect(screen.getByText('Pre-order', { selector: '[data-slot="badge"]' })).toBeInTheDocument()
  })

  it('offers a way back when the filters hide everything', () => {
    renderList()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText(/no dishes match/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(screen.getByText('Lechon Kawali')).toBeInTheDocument()
  })
})
