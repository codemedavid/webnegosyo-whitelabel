/**
 * Telling "no dishes" apart from "we could not load your dishes".
 *
 * `getRecipeCoverage` catches every failure and returns an empty list, so a
 * broken read renders exactly like a tenant with an empty menu. The workbench
 * then said "No dishes match that search" — with nothing typed in the search
 * box — which is wrong twice over: nothing was searched, and the dishes may
 * well exist.
 *
 * A merchant staring at that has no way to tell whether they have no menu, hit
 * a bug, or are looking at stale code. This is the clarity problem in
 * miniature, in code written to fix the clarity problem.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { RecipeWorkbench } from '@/components/admin/recipe-workbench'
import type { RecipeCoverageRow } from '@/lib/inventory/recipe-coverage'
import type { InventoryItem } from '@/types/database'

jest.mock('@/components/admin/recipe-editor', () => ({
  RecipeEditor: () => <div data-testid="recipe-editor" />,
}))

const INGREDIENTS = [{ id: 'pork', name: 'Pork Belly', tenant_id: 't1', is_active: true } as InventoryItem]
const ONE_DISH: RecipeCoverageRow[] = [
  { menuItemId: 'm1', name: 'Adobo', hasRecipe: false, ingredientCount: 0 },
]

function renderWorkbench(props: {
  rows?: RecipeCoverageRow[]
  loadFailed?: boolean
} = {}) {
  render(
    <RecipeWorkbench
      tenantId="t1"
      tenantSlug="cafe"
      rows={props.rows ?? ONE_DISH}
      ingredients={INGREDIENTS}
      components={[]}
      loadFailed={props.loadFailed}
    />,
  )
}

describe('an empty dish list', () => {
  it('says the menu is empty rather than blaming a search nobody typed', () => {
    renderWorkbench({ rows: [] })

    expect(screen.getByText(/no dishes on your menu yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/match that search/i)).not.toBeInTheDocument()
  })

  it('still blames the search when a search was actually typed', () => {
    renderWorkbench()

    fireEvent.change(screen.getByPlaceholderText(/search dishes/i), {
      target: { value: 'pizza' },
    })

    expect(screen.getByText(/match that search/i)).toBeInTheDocument()
  })

  it('blames the filter when a filter hid everything', () => {
    // Nothing typed, but the "Set up" chip is active and no dish qualifies.
    renderWorkbench()

    fireEvent.click(screen.getByRole('button', { name: /set up/i }))

    expect(screen.getByText(/no dishes match/i)).toBeInTheDocument()
  })
})

describe('a failed load', () => {
  it('says the dishes could not be loaded instead of pretending there are none', () => {
    renderWorkbench({ rows: [], loadFailed: true })

    expect(screen.getByText(/could not load your dishes/i)).toBeInTheDocument()
    expect(screen.queryByText(/no dishes on your menu yet/i)).not.toBeInTheDocument()
  })

  it('does not claim a load failed when dishes came back fine', () => {
    renderWorkbench()

    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument()
  })
})
