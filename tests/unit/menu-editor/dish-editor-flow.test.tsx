import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Link from 'next/link'
import type { Category, MenuItem } from '@/types/database'

const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockRouterPush = jest.fn()
const mockRouterRefresh = jest.fn()
const mockToast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() })

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }) }))
jest.mock('@/app/actions/menu-items', () => ({
  createMenuItemAction: (...args: unknown[]) => mockCreate(...args),
  updateMenuItemAction: (...args: unknown[]) => mockUpdate(...args),
}))
jest.mock('@/app/actions/presell', () => ({ syncPresellAllocationsAction: jest.fn() }))
jest.mock('@/app/actions/modifier-library', () => ({ createModifierGroupLibraryEntryAction: jest.fn() }))
jest.mock('@/hooks/use-menu-item-costs', () => ({
  useMenuItemCosts: () => ({ optionRecipeCosts: {}, baseRecipeCost: null, refresh: jest.fn() }),
}))
jest.mock('@/components/shared/image-upload', () => ({ ImageUpload: () => null }))
jest.mock('@/components/admin/tag-manager', () => ({ TagManager: () => null }))
jest.mock('@/components/admin/recipe-editor', () => ({ RecipeEditor: () => null }))
jest.mock('@/components/admin/product-cost-field', () => ({ ProductCostField: () => null }))
jest.mock('@/components/admin/product-cost-field-convex', () => ({ ProductCostFieldConvex: () => null }))
jest.mock('@/components/admin/product-mini-performance', () => ({ ProductMiniPerformance: () => null }))
jest.mock('@/components/admin/addon-library-picker', () => ({ AddonLibraryPicker: () => null }))
jest.mock('@/components/admin/modifier-library-picker', () => ({ ModifierLibraryPicker: () => null }))
jest.mock('sonner', () => ({ toast: mockToast }))

// next/jest leaves static imports ahead of jest.mock, so import lazily.
function loadForm() {
  return (jest.requireActual('@/components/admin/menu-item-form') as typeof import('@/components/admin/menu-item-form')).MenuItemForm
}

const FOOD = { id: '11111111-1111-4111-8111-111111111111', name: 'Food' } as Category
const DRINKS = { id: '33333333-3333-4333-8333-333333333333', name: 'Drinks' } as Category
const ITEM_ID = '22222222-2222-4222-8222-222222222222'

function existingItem(): MenuItem {
  return {
    id: ITEM_ID,
    name: 'Milk tea',
    description: 'Brown sugar milk tea',
    price: 120,
    category_id: DRINKS.id,
    is_available: true,
    modifier_groups: [{
      id: 'g1', name: 'Extras', display_order: 0, min_select: 0, max_select: null, selection_mode: 'quantity',
      options: [{ id: 'o1', name: 'Pearls', price_modifier: 15, display_order: 0 }],
    }],
  } as MenuItem
}

function nameInput() {
  return screen.getByLabelText('Name') as HTMLInputElement
}

beforeEach(() => jest.clearAllMocks())

describe('dish editor', () => {
  it('shows unsaved changes after an edit, and Discard puts the dish back', () => {
    const MenuItemForm = loadForm()
    render(<MenuItemForm item={existingItem()} tenantId="t" tenantSlug="shop" modifierGroupsEnabled categories={[FOOD, DRINKS]} />)

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    fireEvent.change(nameInput(), { target: { value: 'Milk tea XL' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(nameInput().value).toBe('Milk tea')
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('saves a new dish with no description', async () => {
    const MenuItemForm = loadForm()
    mockCreate.mockResolvedValue({ success: true, data: { id: ITEM_ID } })
    const { container } = render(<MenuItemForm tenantId="t" tenantSlug="shop" modifierGroupsEnabled categories={[FOOD]} />)

    fireEvent.change(nameInput(), { target: { value: 'Coke 1.5L' } })
    fireEvent.change(container.querySelector('#price')!, { target: { value: '95' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add dish' }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate.mock.calls[0][2]).toMatchObject({ name: 'Coke 1.5L', description: '', category_id: FOOD.id })
  })

  it('asks for a category instead of filing the dish under the first one', async () => {
    const MenuItemForm = loadForm()
    const { container } = render(<MenuItemForm tenantId="t" tenantSlug="shop" modifierGroupsEnabled categories={[FOOD, DRINKS]} />)

    fireEvent.change(nameInput(), { target: { value: 'Sisig' } })
    fireEvent.change(container.querySelector('#price')!, { target: { value: '180' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add dish' }))

    expect(await screen.findByText('Choose a category.')).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('Save & add another clears the form and keeps the category', async () => {
    const MenuItemForm = loadForm()
    mockCreate.mockResolvedValue({ success: true, data: { id: ITEM_ID } })
    const { container } = render(
      <MenuItemForm tenantId="t" tenantSlug="shop" modifierGroupsEnabled categories={[FOOD, DRINKS]} defaultCategoryId={DRINKS.id} />,
    )

    fireEvent.change(nameInput(), { target: { value: 'Iced tea' } })
    fireEvent.change(container.querySelector('#price')!, { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save & add another' }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(nameInput().value).toBe(''))
    expect(mockCreate.mock.calls[0][2]).toMatchObject({ category_id: DRINKS.id })
    expect(screen.getByRole('combobox', { name: /category/i })).toHaveTextContent('Drinks')
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('stays on the dish after saving an edit', async () => {
    const MenuItemForm = loadForm()
    mockUpdate.mockResolvedValue({ success: true, data: { id: ITEM_ID } })
    render(<MenuItemForm item={existingItem()} tenantId="t" tenantSlug="shop" modifierGroupsEnabled categories={[FOOD, DRINKS]} />)

    fireEvent.change(nameInput(), { target: { value: 'Milk tea XL' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument())
    expect(nameInput().value).toBe('Milk tea XL')
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(mockRouterRefresh).toHaveBeenCalled()
  })

  it('lets a deleted option group be brought back', () => {
    const MenuItemForm = loadForm()
    render(<MenuItemForm item={existingItem()} tenantId="t" tenantSlug="shop" modifierGroupsEnabled categories={[FOOD, DRINKS]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Extras' }))
    expect(screen.queryByDisplayValue('Extras')).not.toBeInTheDocument()

    const [, options] = mockToast.mock.calls.at(-1) as [string, { action: { label: string; onClick: () => void } }]
    expect(options.action.label).toBe('Undo')
    act(() => options.action.onClick())
    expect(screen.getByDisplayValue('Extras')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Pearls')).toBeInTheDocument()
  })

  it('asks before following a Next <Link> away from unsaved changes', () => {
    const MenuItemForm = loadForm()
    render(
      <>
        <Link href="/shop/admin/menu">Back to menu</Link>
        <MenuItemForm item={existingItem()} tenantId="t" tenantSlug="shop" modifierGroupsEnabled categories={[FOOD, DRINKS]} />
      </>,
    )

    fireEvent.change(nameInput(), { target: { value: 'Milk tea XL' } })
    fireEvent.click(screen.getByText('Back to menu'))

    expect(screen.getByText('Leave without saving?')).toBeInTheDocument()
    expect(mockRouterPush).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(mockRouterPush).toHaveBeenCalledWith('/shop/admin/menu')
  })

  it('switches a group between one pick and amounts with two plain controls', () => {
    const MenuItemForm = loadForm()
    render(<MenuItemForm item={existingItem()} tenantId="t" tenantSlug="shop" modifierGroupsEnabled categories={[FOOD, DRINKS]} />)

    expect(screen.getByRole('radio', { name: /amounts/i })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /^one/i }))
    expect(screen.getByRole('radio', { name: /^one/i })).toBeChecked()
    expect(screen.getByRole('switch', { name: /required/i })).not.toBeChecked()
  })
})

describe('dish editor after a save', () => {
  it('stops warning about unsaved changes once a new dish is saved and its recipe step opens', async () => {
    const MenuItemForm = loadForm()
    mockCreate.mockResolvedValue({ success: true, data: { id: ITEM_ID } })
    const { container } = render(<MenuItemForm tenantId="t" tenantSlug="shop" inventoryEnabled modifierGroupsEnabled categories={[FOOD]} />)

    fireEvent.change(nameInput(), { target: { value: 'Taro milk tea' } })
    fireEvent.change(container.querySelector('#price')!, { target: { value: '130' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add dish' }))

    await screen.findByText('Link ingredients now?')
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })
})
