/**
 * Phase 0d — every cost on the dish editor needs `costs` (plan §6.3).
 *
 * A `menu` holder edits dishes and recipes, but the dish's recipe cost, its
 * profit and margin, an option's cost source and margin, and the saved "Cost &
 * profit" field are all `costs`. Without it they are ABSENT — never ₱0 — and
 * the cost action is not even asked (it refuses server-side anyway).
 */

import { fireEvent, render, screen } from '@testing-library/react'
import type { Category, MenuItem, ModifierGroup } from '@/types/database'

const mockUseMenuItemCosts = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))
jest.mock('@/app/actions/menu-items', () => ({ createMenuItemAction: jest.fn(), updateMenuItemAction: jest.fn() }))
jest.mock('@/app/actions/presell', () => ({ syncPresellAllocationsAction: jest.fn() }))
jest.mock('@/app/actions/modifier-library', () => ({ createModifierGroupLibraryEntryAction: jest.fn() }))
jest.mock('@/hooks/use-menu-item-costs', () => ({
  useMenuItemCosts: (...args: unknown[]) => mockUseMenuItemCosts(...args),
}))
jest.mock('@/components/shared/image-upload', () => ({ ImageUpload: () => null }))
jest.mock('@/components/admin/tag-manager', () => ({ TagManager: () => null }))
jest.mock('@/components/admin/recipe-editor', () => ({ RecipeEditor: () => null }))
jest.mock('@/components/admin/modifier-option-recipe-editor', () => ({ ModifierOptionRecipeEditor: () => null }))
jest.mock('@/components/admin/product-cost-field', () => ({ ProductCostField: () => null }))
jest.mock('@/components/admin/product-cost-field-convex', () => ({ ProductCostFieldConvex: () => null }))
jest.mock('@/components/admin/product-mini-performance', () => ({ ProductMiniPerformance: () => null }))
jest.mock('@/components/admin/addon-library-picker', () => ({ AddonLibraryPicker: () => null }))
jest.mock('@/components/admin/modifier-library-picker', () => ({ ModifierLibraryPicker: () => null }))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }))

// next/jest leaves static imports ahead of jest.mock, so import lazily.
function loadForm() {
  return (jest.requireActual('@/components/admin/menu-item-form') as typeof import('@/components/admin/menu-item-form')).MenuItemForm
}

const FOOD = { id: '11111111-1111-4111-8111-111111111111', name: 'Food' } as Category

const SIZE: ModifierGroup = {
  id: 'g1', name: 'Size', display_order: 0, min_select: 0, max_select: 1,
  options: [{ id: 'o1', name: 'Large', price_modifier: 100, display_order: 0, manual_cost: 40, cost_mode: 'simple' }],
}

function dish(): MenuItem {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Adobo',
    description: '',
    price: 200,
    category_id: FOOD.id,
    is_available: true,
    modifier_groups: [SIZE],
  } as MenuItem
}

function renderEditor(canSeeCosts: boolean | undefined) {
  const MenuItemForm = loadForm()
  render(
    <MenuItemForm
      item={dish()}
      tenantId="t"
      tenantSlug="shop"
      categories={[FOOD]}
      modifierGroupsEnabled
      inventoryEnabled
      {...(canSeeCosts === undefined ? {} : { canSeeCosts })}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /more settings for large/i }))
}

beforeEach(() => {
  mockUseMenuItemCosts.mockReset()
  mockUseMenuItemCosts.mockReturnValue({ optionRecipeCosts: {}, baseRecipeCost: 60, refresh: jest.fn() })
})

describe('dish editor — costs need the costs permission', () => {
  it('shows the recipe cost, margin and option costs to an account with costs', () => {
    renderEditor(true)

    expect(screen.getByText('Cost (recipe)')).toBeInTheDocument()
    expect(screen.getByText('Cost source')).toBeInTheDocument()
    expect(screen.getByText(/cost ₱40\.00/)).toBeInTheDocument()
    expect(screen.getByText('Profit calculator')).toBeInTheDocument()
    expect(mockUseMenuItemCosts).toHaveBeenLastCalledWith('t', dish().id, true, true)
  })

  it('never asks for the dish costs without costs', () => {
    renderEditor(false)

    expect(mockUseMenuItemCosts).toHaveBeenLastCalledWith('t', dish().id, true, false)
  })

  it('hides every cost, profit and margin from an account without costs', () => {
    renderEditor(false)

    expect(screen.queryByText('Cost (recipe)')).not.toBeInTheDocument()
    expect(screen.queryByText('Margin')).not.toBeInTheDocument()
    expect(screen.queryByText('Cost source')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Manual cost')).not.toBeInTheDocument()
    expect(screen.queryByText(/% margin/)).not.toBeInTheDocument()
    expect(screen.queryByText('Cost & profit')).not.toBeInTheDocument()
    expect(screen.queryByText('Profit calculator')).not.toBeInTheDocument()
  })

  it('treats a page that did not say as an account without costs', () => {
    renderEditor(undefined)

    expect(screen.queryByText('Cost (recipe)')).not.toBeInTheDocument()
    expect(screen.queryByText('Cost source')).not.toBeInTheDocument()
  })

  it('keeps the rest of the option settings for a menu editor without costs', () => {
    renderEditor(false)

    expect(screen.getByText('Stock tracking')).toBeInTheDocument()
  })
})
