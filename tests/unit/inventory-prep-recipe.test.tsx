/**
 * Phase 3 — attaching a recipe to a prep ingredient from the inventory manager.
 *
 * "Prep item (made in-house)" was a checkbox with nowhere to go: it set a flag
 * and showed a badge, but there was no way to say what the prep is made of. The
 * costing core has read prep recipes since Phase 0; this is the missing door.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import { InventoryManager } from '@/components/admin/inventory-manager'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

jest.mock('@/components/admin/recipe-editor', () => ({
  RecipeEditor: ({ target, label }: { target: unknown; label?: string }) => (
    <div data-testid="recipe-editor" data-target={JSON.stringify(target)}>
      {label}
    </div>
  ),
}))

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const GRAM: InventoryUnitRow = {
  id: 'u-gram', tenant_id: 't1', name: 'Gram', abbreviation: 'g', dimension: 'weight',
  to_base_factor: 1, is_base: true, is_active: true, created_at: '', updated_at: '',
}

const baseItem = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'i1', tenant_id: 't1', name: 'Flour', sku: null, category: null,
  stock_unit_id: 'u-gram', unit_cost: 0.05, is_prep: false, image_url: null,
  current_qty: 0, reorder_level: 0, is_active: true, created_at: '', updated_at: '',
  ...over,
})

const DOUGH = baseItem({ id: 'p1', name: 'Pizza Dough', is_prep: true })
const FLOUR = baseItem({ id: 'i1', name: 'Flour', is_prep: false })

function renderManager(ingredients: InventoryItem[]) {
  render(
    <InventoryManager
      tenantId="t1"
      tenantSlug="demo"
      initialIngredients={ingredients}
      initialUnits={[GRAM]}
    />,
  )
}

describe('InventoryManager prep recipes', () => {
  it('lets a merchant open the recipe for a prep item, keyed to that item', () => {
    // Arrange
    renderManager([DOUGH])

    // Act
    fireEvent.click(screen.getByRole('button', { name: /more actions for pizza dough/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /recipe/i }))

    // Assert
    const editor = screen.getByTestId('recipe-editor')
    expect(JSON.parse(editor.getAttribute('data-target') ?? '{}')).toEqual({
      type: 'prep_item',
      prepItemId: 'p1',
    })
  })

  it('offers no recipe for a raw material, which is bought rather than made', () => {
    renderManager([FLOUR])
    fireEvent.click(screen.getByRole('button', { name: /more actions for flour/i }))

    expect(screen.queryByRole('menuitem', { name: /recipe/i })).not.toBeInTheDocument()
  })

  it('keeps the recipe closed until asked, so the list stays scannable', () => {
    renderManager([DOUGH])

    expect(screen.queryByTestId('recipe-editor')).not.toBeInTheDocument()
  })
})
