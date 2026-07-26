/**
 * The merchant-facing half of cost mode: the per-option "Cost source" choice in
 * the Modifier Groups editor, and the recipe-derived cost it displays.
 *
 * The resolver and the read path are already tested (inventory-cost-mode,
 * inventory-costing-service). What is unproven — and what this file covers — is
 * that a merchant can actually make the choice and see its effect, which is the
 * whole point of Phase 1.
 *
 * `optionRecipeCosts` arrives as a prop rather than being fetched here: the
 * editor stays presentational and the server action stays in the page container.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import type { ModifierGroup } from '@/types/database'
import { ModifierGroupsEditor } from '@/components/admin/modifier-groups-editor'

// The recipe editor talks to server actions; not under test here.
jest.mock('@/components/admin/modifier-option-recipe-editor', () => ({
  ModifierOptionRecipeEditor: () => <div data-testid="recipe-editor" />,
}))

jest.mock('@/components/shared/image-upload', () => ({
  ImageUpload: () => <div data-testid="image-upload" />,
}))

const RECIPE_CONTEXT = {
  tenantId: 't1',
  tenantSlug: 'demo',
  menuItemId: 'm1',
  inventoryEnabled: true,
}

function groupWith(optionOverrides: Partial<ModifierGroup['options'][number]> = {}): ModifierGroup {
  return {
    id: 'grp-size',
    name: 'Size',
    display_order: 0,
    min_select: 0,
    max_select: 1,
    options: [
      {
        id: 'opt-large',
        name: 'Large',
        price_modifier: 100,
        display_order: 0,
        ...optionOverrides,
      },
    ],
  }
}

function renderEditor(group: ModifierGroup, extra: Record<string, unknown> = {}) {
  const onChange = jest.fn()
  render(
    <ModifierGroupsEditor
      groups={[group]}
      onChange={onChange}
      basePrice={0}
      recipeContext={RECIPE_CONTEXT}
      {...extra}
    />,
  )
  return { onChange }
}

describe('per-option cost source control', () => {
  it('lets the merchant switch an option to recipe-based costing', () => {
    // Arrange
    const { onChange } = renderEditor(groupWith({ manual_cost: 40 }))

    // Act
    fireEvent.click(screen.getByRole('button', { name: /recipe/i }))

    // Assert
    const [nextGroups] = onChange.mock.calls[0] as [ModifierGroup[]]
    expect(nextGroups[0].options[0].cost_mode).toBe('composite')
  })

  it('lets the merchant switch back to a typed cost', () => {
    const { onChange } = renderEditor(groupWith({ cost_mode: 'composite', manual_cost: 40 }))

    fireEvent.click(screen.getByRole('button', { name: /manual/i }))

    const [nextGroups] = onChange.mock.calls[0] as [ModifierGroup[]]
    expect(nextGroups[0].options[0].cost_mode).toBe('simple')
  })

  it('shows which source is currently active', () => {
    renderEditor(groupWith({ cost_mode: 'composite' }))

    expect(screen.getByRole('button', { name: /recipe/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /manual/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('costs a composite option from its recipe, not its leftover manual cost', () => {
    // Manual cost 40 is stale; the attached recipe says 25.
    renderEditor(groupWith({ cost_mode: 'composite', manual_cost: 40 }), {
      optionRecipeCosts: { 'opt-large': 25 },
    })

    expect(screen.getByText(/cost ₱25\.00/)).toBeInTheDocument()
  })

  it('ignores the recipe cost for an option the merchant costs manually', () => {
    renderEditor(groupWith({ cost_mode: 'simple', manual_cost: 40 }), {
      optionRecipeCosts: { 'opt-large': 25 },
    })

    expect(screen.getByText(/cost ₱40\.00/)).toBeInTheDocument()
  })

  it('keeps the legacy rule for options saved before cost modes existed', () => {
    // No cost_mode: an attached recipe still overrides the manual cost.
    renderEditor(groupWith({ manual_cost: 40 }), { optionRecipeCosts: { 'opt-large': 25 } })

    expect(screen.getByText(/cost ₱25\.00/)).toBeInTheDocument()
  })

  it('offers the recipe editor for a composite option even when stock is untracked', () => {
    // Costing by recipe must not require turning on recipe-backed stock — they
    // are separate decisions, and previously only stock revealed this editor.
    renderEditor(groupWith({ cost_mode: 'composite', stock_mode: 'none' }))

    expect(screen.getByTestId('recipe-editor')).toBeInTheDocument()
  })

  it('hides the manual cost input when the option is costed by recipe', () => {
    // Leaving an editable field that no longer affects the cost is a lie.
    renderEditor(groupWith({ cost_mode: 'composite' }))

    expect(screen.queryByText(/manual cost/i)).not.toBeInTheDocument()
  })

  it('still shows the manual cost input for a legacy option with no mode', () => {
    renderEditor(groupWith({ manual_cost: 40 }))

    expect(screen.getByText(/manual cost/i)).toBeInTheDocument()
  })
})
