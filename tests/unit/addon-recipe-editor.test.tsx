/**
 * Recipe attachment for legacy addons.
 *
 * Tenants without `modifier_groups_enabled` still edit addons through the old
 * AddonEditor. Without a recipe control here, inventory costing would only ever
 * work for migrated tenants — so this is the path that keeps the feature whole,
 * not a nicety.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import type { Addon } from '@/types/database'
import { AddonEditor } from '@/components/admin/addon-editor'

jest.mock('@/components/admin/recipe-editor', () => ({
  RecipeEditor: ({ target, label }: { target: unknown; label?: string }) => (
    <div data-testid="recipe-editor" data-target={JSON.stringify(target)}>
      {label}
    </div>
  ),
}))

const ADDONS: Addon[] = [{ id: 'a1', name: 'Extra Cheese', price: 15 }]

const RECIPE_CONTEXT = {
  tenantId: 't1',
  tenantSlug: 'demo',
  menuItemId: 'm1',
  inventoryEnabled: true,
}

function renderEditor(extra: Record<string, unknown> = {}) {
  render(
    <AddonEditor
      addons={ADDONS}
      onAddAddon={jest.fn()}
      onRemoveAddon={jest.fn()}
      onUpdateAddon={jest.fn()}
      {...extra}
    />,
  )
}

describe('AddonEditor recipe attachment', () => {
  it('lets a merchant attach a recipe to an addon, keyed to that addon', () => {
    // Arrange
    renderEditor({ recipeContext: RECIPE_CONTEXT })

    // Act — the editor is behind a disclosure; opening it is what mounts it.
    fireEvent.click(screen.getByRole('button', { name: /Recipe for Extra Cheese/ }))

    // Assert
    const editor = screen.getByTestId('recipe-editor')
    expect(JSON.parse(editor.getAttribute('data-target') ?? '{}')).toEqual({
      type: 'addon',
      menuItemId: 'm1',
      addonId: 'a1',
    })
  })

  it('does not mount the recipe editor until the merchant asks for it', () => {
    // Arrange / Act — every add-on used to mount its own editor, and each one
    // fires three server actions that Next runs one after another.
    renderEditor({ recipeContext: RECIPE_CONTEXT })

    // Assert
    expect(screen.getByRole('button', { name: /Recipe for Extra Cheese/ })).toBeInTheDocument()
    expect(screen.queryByTestId('recipe-editor')).not.toBeInTheDocument()
  })

  it('shows no recipe control when the tenant has inventory turned off', () => {
    renderEditor({ recipeContext: { ...RECIPE_CONTEXT, inventoryEnabled: false } })

    expect(screen.queryByTestId('recipe-editor')).not.toBeInTheDocument()
  })

  it('shows no recipe control before the item has been saved', () => {
    // Recipes key on the menu item id, which does not exist yet.
    renderEditor({ recipeContext: { ...RECIPE_CONTEXT, menuItemId: undefined } })

    expect(screen.queryByTestId('recipe-editor')).not.toBeInTheDocument()
  })

  it('renders unchanged for callers that pass no recipe context at all', () => {
    renderEditor()

    expect(screen.queryByTestId('recipe-editor')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Extra Cheese')).toBeInTheDocument()
  })
})
