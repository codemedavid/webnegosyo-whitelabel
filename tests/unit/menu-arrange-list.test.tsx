import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { MenuItemGroup } from '@/lib/menu-list-groups'
import type { MenuItem } from '@/types/database'

/**
 * The web admin's "Arrange" mode. The order set here is the one the
 * storefront AND the POS sort by, so a move must reach the server as the
 * category's full arrangement — and a refused save must not leave the screen
 * claiming an order the customer never sees.
 */

const reorderMenuItemsAction = jest.fn()
const refresh = jest.fn()
const toastError = jest.fn()

jest.mock('@/app/actions/menu-items', () => ({ reorderMenuItemsAction }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
jest.mock('sonner', () => ({ toast: { error: toastError, success: jest.fn() } }))
jest.mock('@/components/shared/optimized-image', () => ({ OptimizedImage: () => null }))

const TENANT = '11111111-1111-4111-8111-111111111111'
const CATEGORY = '22222222-2222-4222-8222-222222222222'

function dish(id: string, name: string): MenuItem {
  return {
    id,
    name,
    tenant_id: TENANT,
    category_id: CATEGORY,
    price: 100,
    discounted_price: null,
    image_url: '',
    is_available: true,
    order: 0,
  } as unknown as MenuItem
}

const groups: MenuItemGroup[] = [
  { key: CATEGORY, name: 'Drinks', items: [dish('a', 'Latte'), dish('b', 'Mocha'), dish('c', 'Tea')] },
]

async function renderList() {
  const { MenuArrangeList } = await import('@/components/admin/menu-arrange-list')
  return render(<MenuArrangeList groups={groups} tenantId={TENANT} tenantSlug="acme" />)
}

function namesInOrder(): string[] {
  const section = screen.getByRole('region', { name: 'Arrange Drinks' })
  return within(section)
    .getAllByRole('listitem')
    .map((row) => within(row).getByText(/Latte|Mocha|Tea/).textContent ?? '')
}

describe('MenuArrangeList', () => {
  beforeEach(() => {
    reorderMenuItemsAction.mockReset()
    refresh.mockReset()
    toastError.mockReset()
  })

  it('lists dishes in their current order', async () => {
    await renderList()

    expect(namesInOrder()).toEqual(['Latte', 'Mocha', 'Tea'])
  })

  it('saves the whole category arrangement when a dish moves down', async () => {
    reorderMenuItemsAction.mockResolvedValue({ success: true } as never)
    await renderList()

    fireEvent.click(screen.getByRole('button', { name: 'Move Latte down' }))

    expect(namesInOrder()).toEqual(['Mocha', 'Latte', 'Tea'])
    await waitFor(() =>
      expect(reorderMenuItemsAction).toHaveBeenCalledWith(TENANT, 'acme', CATEGORY, ['b', 'a', 'c'])
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('disables moving the first dish up and the last dish down', async () => {
    await renderList()

    expect(screen.getByRole('button', { name: 'Move Latte up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Tea down' })).toBeDisabled()
  })

  it('snaps back and explains when the save is refused', async () => {
    reorderMenuItemsAction.mockResolvedValue({ success: false, error: 'Your menu changed' } as never)
    await renderList()

    fireEvent.click(screen.getByRole('button', { name: 'Move Tea up' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Your menu changed'))
    expect(namesInOrder()).toEqual(['Latte', 'Mocha', 'Tea'])
    expect(refresh).not.toHaveBeenCalled()
  })

  it('keeps a move that is still saving when a refresh from an earlier save lands', async () => {
    reorderMenuItemsAction.mockReturnValue(new Promise(() => {}) as never)
    const { MenuArrangeList } = await import('@/components/admin/menu-arrange-list')
    const { rerender } = render(<MenuArrangeList groups={groups} tenantId={TENANT} tenantSlug="acme" />)

    fireEvent.click(screen.getByRole('button', { name: 'Move Latte down' }))
    const refreshed = groups.map((group) => ({ ...group, items: [...group.items] }))
    rerender(<MenuArrangeList groups={refreshed} tenantId={TENANT} tenantSlug="acme" />)

    expect(namesInOrder()).toEqual(['Mocha', 'Latte', 'Tea'])
  })
})
