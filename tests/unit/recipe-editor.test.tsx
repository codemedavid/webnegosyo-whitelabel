/**
 * Phase 2 — the recipe editor generalized from "modifier options only" to any
 * costable target (base item, variation option, addon, modifier option).
 *
 * The recipe-attach control already existed, but only a modifier option could
 * reach it: a merchant could cost a "Large" upgrade from ingredients while the
 * item itself had no recipe at all. These tests pin the behavior that must hold
 * for every target, and the target-specific behavior that must not leak.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RecipeTarget } from '@/lib/inventory/recipe-target'
import { RecipeEditor } from '@/components/admin/recipe-editor'

const getIngredientsAction = jest.fn()
const getInventoryUnitsAction = jest.fn()
const getRecipeForTargetAction = jest.fn()
const saveRecipeForTargetAction = jest.fn()
const deleteRecipeForTargetAction = jest.fn()

jest.mock('@/app/actions/inventory', () => ({
  getIngredientsAction: (...a: unknown[]) => getIngredientsAction(...a),
  getInventoryUnitsAction: (...a: unknown[]) => getInventoryUnitsAction(...a),
  getRecipeForTargetAction: (...a: unknown[]) => getRecipeForTargetAction(...a),
  saveRecipeForTargetAction: (...a: unknown[]) => saveRecipeForTargetAction(...a),
  deleteRecipeForTargetAction: (...a: unknown[]) => deleteRecipeForTargetAction(...a),
}))

const toastError = jest.fn()
const toastSuccess = jest.fn()
jest.mock('sonner', () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
  },
}))

const FLOUR = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: 't1',
  name: 'Flour',
  sku: null,
  category: null,
  stock_unit_id: '22222222-2222-4222-8222-222222222222',
  unit_cost: 0.05,
  is_prep: false,
  image_url: null,
  current_qty: 0,
  reorder_level: 0,
  is_active: true,
  created_at: '',
  updated_at: '',
}

const GRAM = {
  id: '22222222-2222-4222-8222-222222222222',
  tenant_id: 't1',
  name: 'Gram',
  abbreviation: 'g',
  dimension: 'weight',
  to_base_factor: 1,
  is_base: true,
  is_active: true,
  created_at: '',
  updated_at: '',
}

const ITEM_TARGET: RecipeTarget = { type: 'menu_item', menuItemId: 'm1' }
const ADDON_TARGET: RecipeTarget = { type: 'addon', menuItemId: 'm1', addonId: 'a1' }

function recipeWith(unitId = '22222222-2222-4222-8222-222222222222') {
  return {
    recipe: { id: 'r1', notes: null },
    components: [{ inventory_item_id: '11111111-1111-4111-8111-111111111111', quantity: 120, unit_id: unitId }],
  }
}

function setup({
  ingredients = [FLOUR],
  recipe = null as ReturnType<typeof recipeWith> | null,
} = {}) {
  getIngredientsAction.mockResolvedValue({ success: true, data: ingredients })
  getInventoryUnitsAction.mockResolvedValue({ success: true, data: [GRAM] })
  getRecipeForTargetAction.mockResolvedValue({ success: true, data: recipe })
  saveRecipeForTargetAction.mockResolvedValue({ success: true, data: {} })
  deleteRecipeForTargetAction.mockResolvedValue({ success: true })
}

beforeEach(() => {
  ;[
    getIngredientsAction,
    getInventoryUnitsAction,
    getRecipeForTargetAction,
    saveRecipeForTargetAction,
    deleteRecipeForTargetAction,
    toastError,
    toastSuccess,
  ].forEach((m) => m.mockReset())
})

function renderEditor(target: RecipeTarget, extra: Record<string, unknown> = {}) {
  return render(<RecipeEditor tenantId="t1" tenantSlug="demo" target={target} {...extra} />)
}

describe('RecipeEditor', () => {
  it('loads the existing recipe for whichever target it is given', async () => {
    // Arrange — a base-item recipe, the target that had no editor before.
    setup({ recipe: recipeWith() })

    // Act
    renderEditor(ITEM_TARGET)

    // Assert
    expect(await screen.findByDisplayValue('120')).toBeInTheDocument()
    expect(getRecipeForTargetAction).toHaveBeenCalledWith('t1', ITEM_TARGET)
  })

  it('saves against the target it was given, not a hardcoded one', async () => {
    setup({ recipe: recipeWith() })
    renderEditor(ADDON_TARGET)

    fireEvent.click(await screen.findByRole('button', { name: /save recipe/i }))

    await waitFor(() => expect(saveRecipeForTargetAction).toHaveBeenCalled())
    const [, , target] = saveRecipeForTargetAction.mock.calls[0]
    expect(target).toEqual(ADDON_TARGET)
  })

  it('clears the recipe instead of saving an empty one', async () => {
    setup({ recipe: recipeWith() })
    renderEditor(ITEM_TARGET)

    // Remove the only ingredient line, then save.
    fireEvent.click(await screen.findByRole('button', { name: /remove ingredient/i }))
    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }))

    await waitFor(() => expect(deleteRecipeForTargetAction).toHaveBeenCalled())
    expect(saveRecipeForTargetAction).not.toHaveBeenCalled()
  })

  it('tells the merchant to add ingredients before a recipe can be attached', async () => {
    setup({ ingredients: [] })

    renderEditor(ITEM_TARGET)

    expect(await screen.findByText(/no ingredients yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save recipe/i })).not.toBeInTheDocument()
  })

  it('refuses to save a line that is missing its unit', async () => {
    setup({ recipe: recipeWith('') })
    renderEditor(ITEM_TARGET)

    fireEvent.click(await screen.findByRole('button', { name: /save recipe/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(saveRecipeForTargetAction).not.toHaveBeenCalled()
  })

  it('notifies the container after a save so a cost display can refresh', async () => {
    setup({ recipe: recipeWith() })
    const onSaved = jest.fn()
    renderEditor(ITEM_TARGET, { onSaved })

    fireEvent.click(await screen.findByRole('button', { name: /save recipe/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('uses the caller-supplied heading so each target reads correctly', async () => {
    setup({ recipe: recipeWith() })

    renderEditor(ITEM_TARGET, { label: 'Base recipe (ingredients per item)' })

    expect(await screen.findByText(/base recipe \(ingredients per item\)/i)).toBeInTheDocument()
  })
})

// ── Phase 3: prep yields ─────────────────────────────────────────────────────

const PREP_TARGET: RecipeTarget = { type: 'prep_item', prepItemId: 'p1' }

// The prep being edited is itself an ingredient row — that is how a prep gets
// used inside other recipes, and where its stock unit comes from.
const DOUGH = { ...FLOUR, id: 'p1', name: 'Pizza Dough', is_prep: true }

describe('RecipeEditor prep yield', () => {
  it('asks a prep recipe how much it makes, and saves the answer', async () => {
    // Arrange — without a yield the costing core cannot divide the batch cost
    // down to a per-unit cost, so it silently falls back to the manual price.
    setup({ recipe: recipeWith(), ingredients: [FLOUR, DOUGH] })
    renderEditor(PREP_TARGET)

    // Act
    fireEvent.change(await screen.findByLabelText(/yields/i), { target: { value: '900' } })
    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }))

    // Assert
    await waitFor(() => expect(saveRecipeForTargetAction).toHaveBeenCalled())
    const [, , , input] = saveRecipeForTargetAction.mock.calls[0]
    expect(input.yield_quantity).toBe(900)
    expect(input.yield_unit_id).toBe(GRAM.id)
  })

  it('shows no yield field for targets that are sold, not produced', async () => {
    // A menu item, option or addon is consumed per sale; "yield" is meaningless
    // there and would only invite a wrong number.
    setup({ recipe: recipeWith() })
    renderEditor(ITEM_TARGET)

    await screen.findByRole('button', { name: /save recipe/i })
    expect(screen.queryByLabelText(/yields/i)).not.toBeInTheDocument()
  })

  it('loads a previously saved yield so it can be corrected', async () => {
    setup({
      recipe: {
        recipe: { id: 'r1', notes: null, yield_quantity: 750, yield_unit_id: GRAM.id },
        components: recipeWith().components,
      } as never,
      ingredients: [FLOUR, DOUGH],
    })

    renderEditor(PREP_TARGET)

    expect(await screen.findByDisplayValue('750')).toBeInTheDocument()
  })
})
