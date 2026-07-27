/**
 * The recipe workbench: pick a dish on the left, build its recipe on the right.
 *
 * What this replaces: a tab that could only *link out* to the menu-item form.
 * Every recipe meant a page navigation, a scroll past the cost fields, and a
 * trip back — with no search, so on a 51-dish menu you could not even find the
 * dish you meant. That is the reported bug: "we can't create a recipe for an
 * item and we can't see any item we want to add a recipe with."
 *
 * The editor itself is `RecipeEditor`, already proven and reused untouched;
 * this covers the picker around it and the wiring between the two.
 */

import { render, screen, fireEvent, within } from '@testing-library/react'
import { RecipeWorkbench } from '@/components/admin/recipe-workbench'
import type { RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'
import type { InventoryItem, RecipeComponent } from '@/types/database'

// The editor does its own server round-trips; this suite is about the picker.
jest.mock('@/components/admin/recipe-editor', () => ({
  RecipeEditor: ({ target }: { target: { menuItemId?: string } }) => (
    <div data-testid="recipe-editor">editing {target.menuItemId}</div>
  ),
}))

const ROWS: RecipeCoverageRow[] = [
  { menuItemId: 'm2', name: 'Bicol Express', hasRecipe: false, ingredientCount: 0 },
  { menuItemId: 'm3', name: 'Chicken Adobo Rice', hasRecipe: false, ingredientCount: 0 },
  { menuItemId: 'm1', name: 'Adobo', hasRecipe: true, ingredientCount: 3 },
]

function ingredient(id: string, name: string): InventoryItem {
  return { id, name, tenant_id: 't1', is_active: true } as InventoryItem
}

function renderWorkbench({
  rows = ROWS,
  ingredients = [ingredient('pork', 'Pork Belly')],
  components = [{ recipe_id: 'r1', inventory_item_id: 'pork' } as RecipeComponent],
} = {}) {
  render(
    <RecipeWorkbench
      tenantId="t1"
      tenantSlug="cafe"
      rows={rows}
      ingredients={ingredients}
      components={components}
    />,
  )
}

describe('picking a dish', () => {
  it('lists every dish so you can see what you are choosing from', () => {
    renderWorkbench()

    expect(screen.getByText('Bicol Express')).toBeInTheDocument()
    expect(screen.getByText('Adobo')).toBeInTheDocument()
  })

  it('finds a dish by a word anywhere in its name', () => {
    renderWorkbench()

    fireEvent.change(screen.getByPlaceholderText(/search dishes/i), {
      target: { value: 'adobo' },
    })

    expect(screen.getByText('Chicken Adobo Rice')).toBeInTheDocument()
    expect(screen.queryByText('Bicol Express')).not.toBeInTheDocument()
  })

  it('narrows to only the dishes still needing a recipe', () => {
    renderWorkbench()

    fireEvent.click(screen.getByRole('button', { name: /needs recipe/i }))

    expect(screen.queryByText('Adobo')).not.toBeInTheDocument()
    expect(screen.getByText('Bicol Express')).toBeInTheDocument()
  })

  it('shows how many dishes sit behind each filter', () => {
    renderWorkbench()

    expect(screen.getByRole('button', { name: /needs recipe 2/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set up 1/i })).toBeInTheDocument()
  })

  it('says so when a search matches nothing, rather than showing a blank column', () => {
    renderWorkbench()

    fireEvent.change(screen.getByPlaceholderText(/search dishes/i), {
      target: { value: 'pizza' },
    })

    expect(screen.getByText(/no dishes match/i)).toBeInTheDocument()
  })
})

describe('building the recipe', () => {
  it('opens the first dish needing a recipe, so the work starts without a click', () => {
    // The list is already ordered actionable-first, so landing on nothing
    // selected would waste the one decision the screen has made for you.
    renderWorkbench()

    expect(screen.getByTestId('recipe-editor')).toHaveTextContent('editing m2')
  })

  it('switches the editor to whichever dish you pick, without navigating away', () => {
    renderWorkbench()

    fireEvent.click(screen.getByText('Adobo'))

    expect(screen.getByTestId('recipe-editor')).toHaveTextContent('editing m1')
  })

  it('names the dish being edited, so the two panes cannot be confused', () => {
    renderWorkbench()

    fireEvent.click(screen.getByText('Adobo'))

    expect(within(screen.getByTestId('workbench-editor-pane')).getByText('Adobo')).toBeInTheDocument()
  })

  it('marks the selected dish in the list', () => {
    renderWorkbench()

    fireEvent.click(screen.getByText('Adobo'))

    expect(screen.getByTestId('dish-m1')).toHaveAttribute('aria-current', 'true')
  })
})

describe('when there is nothing to work with', () => {
  it('sends a merchant with no ingredients to the Ingredients tab first', () => {
    renderWorkbench({ ingredients: [], components: [] })

    expect(screen.getByText(/add ingredients first/i)).toBeInTheDocument()
    expect(screen.queryByTestId('recipe-editor')).not.toBeInTheDocument()
  })

  it('still flags ingredients that no recipe consumes', () => {
    renderWorkbench({
      ingredients: [ingredient('pork', 'Pork Belly'), ingredient('mozza', 'Mozzarella')],
    })

    expect(screen.getByText('Mozzarella')).toBeInTheDocument()
  })
})
