import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MenuItemForm } from '@/components/admin/menu-item-form'
import type { Category, MenuItem } from '@/types/database'

const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockAllocations = jest.fn()
const mockRouterPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush, refresh: jest.fn() }) }))
jest.mock('@/app/actions/menu-items', () => ({ createMenuItemAction: (...args: unknown[]) => mockCreate(...args), updateMenuItemAction: (...args: unknown[]) => mockUpdate(...args) }))
jest.mock('@/app/actions/presell', () => ({ syncPresellAllocationsAction: (...args: unknown[]) => mockAllocations(...args) }))
jest.mock('@/app/actions/modifier-library', () => ({ createModifierGroupLibraryEntryAction: jest.fn() }))
jest.mock('@/hooks/use-menu-item-costs', () => ({ useMenuItemCosts: () => ({ optionRecipeCosts: {}, refresh: jest.fn() }) }))
jest.mock('@/components/shared/image-upload', () => ({ ImageUpload: () => null }))
jest.mock('@/components/admin/tag-manager', () => ({ TagManager: () => null }))
jest.mock('@/components/admin/recipe-editor', () => ({
  RecipeEditor: ({ onSavingChange }: { onSavingChange?: (saving: boolean) => void }) => (
    <button type="button" onClick={() => onSavingChange?.(true)}>Begin recipe save</button>
  ),
}))
jest.mock('@/components/admin/product-cost-field', () => ({ ProductCostField: () => null }))
jest.mock('@/components/admin/product-cost-field-convex', () => ({ ProductCostFieldConvex: () => null }))
jest.mock('@/components/admin/product-mini-performance', () => ({ ProductMiniPerformance: () => null }))
jest.mock('@/components/admin/addon-library-picker', () => ({ AddonLibraryPicker: () => null }))
jest.mock('@/components/admin/modifier-library-picker', () => ({ ModifierLibraryPicker: () => null }))
jest.mock('@/components/admin/menu-item-presell-section', () => ({
  SettingSwitch: () => null,
  MenuItemPresellSection: ({ onDraftChange }: { onDraftChange: (draft: unknown[]) => void }) => <button type="button" onClick={() => onDraftChange([{ presellDate: '2026-12-20', stockQty: 5, soldQty: 0 }])}>Stage date</button>,
}))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

beforeEach(() => jest.clearAllMocks())

it('does not send the editor stock snapshot when saving an unrelated item edit', async () => {
  const item = {
    id: '22222222-2222-4222-8222-222222222222', name: 'Dish', description: 'A delicious dish', price: 100,
    category_id: '11111111-1111-4111-8111-111111111111',
    modifier_groups: [{ id: 'g', name: 'Extras', display_order: 0, min_select: 0, max_select: null,
      options: [{ id: 'cheese', name: 'Cheese', price_modifier: 10, display_order: 0, stock_mode: 'simple', stock_qty: 10 }] }],
  } as MenuItem
  mockUpdate.mockResolvedValue({ success: true, data: { id: item.id } })
  const { container } = render(<MenuItemForm item={item} tenantId="tenant" tenantSlug="shop" modifierGroupsEnabled categories={[{ id: item.category_id, name: 'Food' } as Category]} />)
  fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'A newly described dish' } })
  fireEvent.submit(container.querySelector('form')!)
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
  const payload = mockUpdate.mock.calls[0][3]
  expect(payload.modifier_groups[0].options[0]).not.toHaveProperty('stock_qty')
  expect(payload.modifier_groups[0].options[0].name).toBe('Cheese')
})

it('updates the created item when retrying after a failed allocation save', async () => {
  const id = '22222222-2222-4222-8222-222222222222'
  mockCreate.mockResolvedValue({ success: true, data: { id } })
  mockUpdate.mockResolvedValue({ success: true, data: { id } })
  mockAllocations.mockResolvedValueOnce({ success: false, error: 'Temporary failure' }).mockResolvedValueOnce({ success: true })
  const { container } = render(<MenuItemForm tenantId="tenant" tenantSlug="shop" presellEnabled categories={[{ id: '11111111-1111-4111-8111-111111111111', name: 'Food' } as Category]} />)
  fireEvent.change(screen.getByLabelText('Item Name *'), { target: { value: 'New dish' } })
  fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'A delicious new dish' } })
  fireEvent.change(container.querySelector('#price')!, { target: { value: '100' } })
  fireEvent.click(screen.getByText('Stage date'))
  fireEvent.submit(container.querySelector('form')!)
  await waitFor(() => expect(mockAllocations).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(container.querySelector('button[type="submit"]')).not.toBeDisabled())
  fireEvent.submit(container.querySelector('form')!)
  await waitFor(() => expect(mockAllocations).toHaveBeenCalledTimes(2))
  expect(mockCreate).toHaveBeenCalledTimes(1)
  expect(mockUpdate).toHaveBeenCalledWith(id, 'tenant', 'shop', expect.objectContaining({ name: 'New dish' }))
})

it('keeps the new-item recipe dialog open while its recipe write is pending', async () => {
  const id = '22222222-2222-4222-8222-222222222222'
  mockCreate.mockResolvedValue({ success: true, data: { id } })
  const { container } = render(
    <MenuItemForm
      tenantId="tenant"
      tenantSlug="shop"
      inventoryEnabled
      categories={[{
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Food',
      } as Category]}
    />,
  )
  fireEvent.change(screen.getByLabelText('Item Name *'), { target: { value: 'New dish' } })
  fireEvent.change(screen.getByLabelText('Description *'), {
    target: { value: 'A delicious new dish' },
  })
  fireEvent.change(container.querySelector('#price')!, { target: { value: '100' } })
  fireEvent.submit(container.querySelector('form')!)
  await screen.findByText('Link ingredients now?')

  fireEvent.click(screen.getByRole('button', { name: /begin recipe save/i }))

  expect(screen.getByRole('button', { name: /skip for now/i })).toBeDisabled()
  expect(screen.getByRole('button', { name: /^done$/i })).toBeDisabled()
  expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument()
  expect(mockRouterPush).not.toHaveBeenCalled()
})
