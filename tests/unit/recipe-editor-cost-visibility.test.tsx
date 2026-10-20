/**
 * Phase 0d — a recipe's "Est. cost" needs `costs` (plan §6.3).
 *
 * The recipe editor is mounted from five places (the Recipes tab, a prep's
 * recipe, the dish editor's Ingredients row, the post-save recipe step, every
 * modifier option), several of them through components that know nothing about
 * permissions. So the screen that knows the caller provides the answer once,
 * and the editor reads it. With no provider it shows NO cost: a mount nobody
 * thought about must hide the figure, not leak it.
 */

import { render, screen } from '@testing-library/react'
import { RecipeEditor } from '@/components/admin/recipe-editor'
import { CostVisibilityProvider } from '@/components/admin/inventory-manager/cost-visibility'

const FLOUR = {
  id: 'flour', tenant_id: 't1', name: 'Flour', sku: null, category: null,
  stock_unit_id: 'g', unit_cost: 0.05, is_prep: false, image_url: null, current_qty: 0,
  reorder_level: 0, is_active: true, created_at: '', updated_at: '',
}
const GRAM = {
  id: 'g', tenant_id: 't1', name: 'Gram', abbreviation: 'g', dimension: 'weight',
  to_base_factor: 1, is_base: true, is_active: true, created_at: '', updated_at: '',
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: {
        ingredients: [FLOUR],
        units: [GRAM],
        recipe: {
          recipe: { id: 'r1', notes: null },
          components: [{ inventory_item_id: 'flour', quantity: 120, unit_id: 'g' }],
        },
      },
    }),
  }) as typeof fetch
})

const editor = (
  <RecipeEditor tenantId="t1" tenantSlug="demo" target={{ type: 'menu_item', menuItemId: 'm1' }} />
)

describe('RecipeEditor — the estimated cost', () => {
  it('shows the estimate to an account with costs', async () => {
    render(<CostVisibilityProvider canSeeCosts>{editor}</CostVisibilityProvider>)

    expect(await screen.findByText('Est. cost ₱6.00')).toBeInTheDocument()
  })

  it('hides the estimate from an account without costs', async () => {
    render(<CostVisibilityProvider canSeeCosts={false}>{editor}</CostVisibilityProvider>)

    expect(await screen.findByDisplayValue('120')).toBeInTheDocument()
    expect(screen.queryByText(/Est\. cost/)).not.toBeInTheDocument()
  })

  it('hides the estimate when no screen said who is looking', async () => {
    render(editor)

    expect(await screen.findByDisplayValue('120')).toBeInTheDocument()
    expect(screen.queryByText(/₱/)).not.toBeInTheDocument()
  })
})
