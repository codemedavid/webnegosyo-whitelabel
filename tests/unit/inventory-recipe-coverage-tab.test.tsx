/**
 * The surface that makes recipes findable.
 *
 * Until now the only way to a recipe was to open a dish, scroll past the cost
 * fields to the bottom of a ~750-line form, and know to look. There was no
 * list, no count, and no way to see that an ingredient was consumed by nothing.
 * A real merchant switched inventory on, made one ingredient, and stopped.
 *
 * This tab exists to answer "what still needs doing?" without opening anything.
 */

import { render, screen, within } from '@testing-library/react'
import { RecipeCoverageTab } from '@/components/admin/recipe-coverage-tab'
import { buildRecipeCoverage } from '@/lib/inventory/recipe-coverage'
import type { InventoryItem, MenuItem, Recipe, RecipeComponent } from '@/types/database'

const ADOBO = { id: 'm1', name: 'Adobo', tenant_id: 't1' } as MenuItem
const SISIG = { id: 'm2', name: 'Sisig', tenant_id: 't1' } as MenuItem
const ADOBO_RECIPE = {
  id: 'r1',
  tenant_id: 't1',
  target_type: 'menu_item',
  menu_item_id: 'm1',
} as Recipe
const PORK_IN_ADOBO = {
  id: 'c1',
  tenant_id: 't1',
  recipe_id: 'r1',
  inventory_item_id: 'pork',
} as RecipeComponent

function ingredient(id: string, name: string): InventoryItem {
  return { id, name, tenant_id: 't1', is_active: true } as InventoryItem
}

function renderTab({
  menuItems = [ADOBO, SISIG],
  recipes = [ADOBO_RECIPE],
  components = [PORK_IN_ADOBO],
  ingredients = [ingredient('pork', 'Pork Belly')],
}: {
  menuItems?: MenuItem[]
  recipes?: Recipe[]
  components?: RecipeComponent[]
  ingredients?: InventoryItem[]
} = {}) {
  render(
    <RecipeCoverageTab
      tenantSlug="cafe"
      rows={buildRecipeCoverage(menuItems, recipes, components)}
      ingredients={ingredients}
      components={components}
    />,
  )
}

describe('recipe coverage tab', () => {
  it('says how many dishes are set up out of the total', () => {
    renderTab()

    expect(screen.getByText(/1 of 2 dishes/i)).toBeInTheDocument()
  })

  it('links a dish with no recipe straight to where its recipe is built', () => {
    // The whole failure was that this destination was unreachable in practice.
    renderTab()

    const row = screen.getByTestId('coverage-row-m2')
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/cafe/admin/menu/m2')
  })

  it('shows how many ingredients a set-up dish uses', () => {
    renderTab()

    const row = screen.getByTestId('coverage-row-m1')
    expect(within(row).getByText(/1 ingredient/i)).toBeInTheDocument()
  })

  it('names an ingredient no recipe consumes, so stock that cannot move is visible', () => {
    renderTab({ ingredients: [ingredient('pork', 'Pork Belly'), ingredient('mozza', 'Mozzarella')] })

    expect(screen.getByText(/Mozzarella/)).toBeInTheDocument()
  })

  it('says nothing about unused ingredients when every one is consumed', () => {
    renderTab()

    expect(screen.queryByText(/not used by any recipe/i)).not.toBeInTheDocument()
  })

  it('tells a merchant with no ingredients to start there, not with recipes', () => {
    // Order matters: a recipe cannot be built before an ingredient exists, so
    // pointing at recipes first is a dead end.
    renderTab({ ingredients: [], recipes: [], components: [] })

    expect(screen.getByText(/add ingredients first/i)).toBeInTheDocument()
  })

  it('congratulates nothing and simply reports full coverage', () => {
    renderTab({ menuItems: [ADOBO] })

    expect(screen.getByText(/1 of 1 dishes/i)).toBeInTheDocument()
    expect(screen.queryByTestId('coverage-empty')).not.toBeInTheDocument()
  })
})
