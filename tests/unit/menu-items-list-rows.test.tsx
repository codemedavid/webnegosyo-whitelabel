/**
 * The simplified menu list: dishes grouped by category, a row that opens the
 * dish, and a switch that moves the moment it is tapped.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MenuItemsList } from '@/components/admin/menu-items-list'
import type { Category, MenuItem } from '@/types/database'

const mockToggle = jest.fn()
const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@/app/actions/menu-items', () => ({
  toggleAvailabilityAction: (...args: unknown[]) => mockToggle(...args),
}))

const item = (overrides: Partial<MenuItem>): MenuItem => ({
  id: 'x', tenant_id: 't1', category_id: 'rice', name: 'Adobo', description: 'Braised chicken', price: 149,
  image_url: '', is_available: true, is_featured: false, order: 0, ...overrides,
} as MenuItem)

const CATEGORIES: Category[] = [
  { id: 'rice', tenant_id: 't1', name: 'Rice Meals', order: 0 } as Category,
  { id: 'drinks', tenant_id: 't1', name: 'Drinks', order: 1 } as Category,
]

beforeEach(() => jest.clearAllMocks())

describe('the menu list', () => {
  it('lists dishes under their category heading', () => {
    render(
      <MenuItemsList
        items={[item({ id: 'a', name: 'Adobo' }), item({ id: 'c', name: 'Iced Tea', category_id: 'drinks' })]}
        categories={CATEGORIES}
        tenantSlug="cafe"
        tenantId="t1"
      />,
    )

    const drinks = screen.getByRole('region', { name: 'Drinks' })
    expect(within(drinks).getByText('Iced Tea')).toBeInTheDocument()
    expect(within(drinks).queryByText('Adobo')).not.toBeInTheDocument()
  })

  it('opens the dish when its row is tapped', () => {
    render(<MenuItemsList items={[item({ id: 'a' })]} categories={CATEGORIES} tenantSlug="cafe" tenantId="t1" />)

    expect(screen.getByRole('link', { name: /adobo/i })).toHaveAttribute('href', '/cafe/admin/menu/a')
  })

  it('no longer offers a delete button on the list', () => {
    render(<MenuItemsList items={[item({ id: 'a' })]} categories={CATEGORIES} tenantSlug="cafe" tenantId="t1" />)

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('flips the switch before the server answers', async () => {
    let resolveToggle: (value: { success: boolean }) => void = () => {}
    mockToggle.mockReturnValue(new Promise((resolve) => { resolveToggle = resolve }))
    render(<MenuItemsList items={[item({ id: 'a' })]} categories={CATEGORIES} tenantSlug="cafe" tenantId="t1" />)

    fireEvent.click(screen.getByRole('switch', { name: /adobo/i }))

    expect(screen.getByRole('switch', { name: /adobo/i })).not.toBeChecked()
    expect(mockToggle).toHaveBeenCalledWith('a', 't1', 'cafe', false)
    await act(async () => resolveToggle({ success: true }))
    // The action's own revalidatePath already ships this page's fresh render
    // with its response; a router.refresh() on top rendered the page twice.
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('puts the switch back when the save is refused', async () => {
    mockToggle.mockResolvedValue({ success: false, error: 'Nope' })
    render(<MenuItemsList items={[item({ id: 'a' })]} categories={CATEGORIES} tenantSlug="cafe" tenantId="t1" />)

    fireEvent.click(screen.getByRole('switch', { name: /adobo/i }))

    await waitFor(() => expect(screen.getByRole('switch', { name: /adobo/i })).toBeChecked())
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('invites the owner to add a first dish when the menu is empty', () => {
    render(<MenuItemsList items={[]} categories={CATEGORIES} tenantSlug="cafe" tenantId="t1" />)

    expect(screen.getByText('Add your first dish')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add dish/i })).toHaveAttribute('href', '/cafe/admin/menu/new')
  })
})
