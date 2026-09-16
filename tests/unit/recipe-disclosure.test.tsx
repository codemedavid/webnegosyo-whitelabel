/**
 * A recipe editor that costs nothing until it is opened.
 *
 * The menu item editor mounts one `RecipeEditor` per add-on and per
 * recipe-stock modifier option, and each one fires three server actions on
 * mount — two of which re-read the tenant's whole ingredient and unit
 * catalogs. A dish with eight add-ons therefore queued ~27 server actions the
 * moment the editor hydrated, and Next runs them strictly one after another.
 * That was the bulk of "it takes too much time before it loads".
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { RecipeDisclosure } from '@/components/admin/recipe-disclosure'

/**
 * Counts MOUNTS, not renders: a remount is what would refire the editor's
 * three server actions and discard a half-typed recipe.
 */
const recipeEditorMounts = jest.fn()
jest.mock('@/components/admin/recipe-editor', () => ({
  RecipeEditor: ({ label }: { label?: string }) => {
    useEffect(() => recipeEditorMounts(), [])
    return <div data-testid="recipe-editor">{label ?? 'Recipe'}</div>
  },
}))

const TARGET = { type: 'addon' as const, menuItemId: 'm1', addonId: 'a1' }

function renderDisclosure(hasRecipe = false) {
  return render(
    <RecipeDisclosure
      tenantId="t1"
      tenantSlug="cafe"
      target={TARGET}
      label="Recipe for Extra cheese"
      hasRecipe={hasRecipe}
    />,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('RecipeDisclosure', () => {
  it('does not mount the recipe editor until it is opened', () => {
    // Arrange & Act
    renderDisclosure()

    // Assert
    expect(recipeEditorMounts).not.toHaveBeenCalled()
    expect(screen.queryByTestId('recipe-editor')).not.toBeInTheDocument()
  })

  it('mounts the editor once opened', () => {
    // Arrange
    renderDisclosure()

    // Act
    fireEvent.click(screen.getByRole('button', { name: /Recipe for Extra cheese/ }))

    // Assert
    expect(screen.getByTestId('recipe-editor')).toBeInTheDocument()
    expect(recipeEditorMounts).toHaveBeenCalledTimes(1)
  })

  it('keeps the editor mounted when collapsed again, so a draft is not lost', () => {
    // Arrange
    renderDisclosure()
    const toggle = screen.getByRole('button', { name: /Recipe for Extra cheese/ })
    fireEvent.click(toggle)

    // Act
    fireEvent.click(toggle)

    // Assert — hidden, not unmounted: re-opening must not refetch or discard
    // half-typed lines.
    expect(screen.getByTestId('recipe-editor')).not.toBeVisible()
    expect(recipeEditorMounts).toHaveBeenCalledTimes(1)
  })

  it('reports its open state for assistive technology', () => {
    // Arrange
    renderDisclosure()
    const toggle = screen.getByRole('button', { name: /Recipe for Extra cheese/ })

    // Assert
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // Act
    fireEvent.click(toggle)

    // Assert
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('says when a recipe is already attached, so it is not hidden behind a closed row', () => {
    // Arrange & Act
    renderDisclosure(true)

    // Assert
    expect(screen.getByRole('button', { name: /Recipe for Extra cheese/ })).toHaveTextContent(/linked/i)
  })
})
