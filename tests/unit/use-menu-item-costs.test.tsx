/**
 * The hook that finally gives `getMenuItemCostAction` a caller: it loads one
 * menu item's recipe-derived costs for the product editor.
 *
 * The editor must degrade quietly — a tenant without inventory, an unsaved item,
 * or a failed load all mean "no recipe costs to show", never a broken form.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { useMenuItemCosts } from '@/hooks/use-menu-item-costs'

const getMenuItemCostAction = jest.fn()
jest.mock('@/app/actions/inventory', () => ({
  getMenuItemCostAction: (...args: unknown[]) => getMenuItemCostAction(...args),
}))

beforeEach(() => {
  getMenuItemCostAction.mockReset()
})

const BREAKDOWN = {
  baseCost: 30,
  variationOptionCosts: {},
  addonCosts: {},
  modifierOptionCosts: { 'opt-large': 25 },
  errors: [],
}

describe('useMenuItemCosts', () => {
  it('exposes the per-modifier-option recipe costs once loaded', async () => {
    // Arrange
    getMenuItemCostAction.mockResolvedValue({ success: true, data: BREAKDOWN })

    // Act
    const { result } = renderHook(() => useMenuItemCosts('t1', 'm1', true, true))

    // Assert
    await waitFor(() => expect(result.current.optionRecipeCosts).toEqual({ 'opt-large': 25 }))
    expect(getMenuItemCostAction).toHaveBeenCalledWith('t1', 'm1')
  })

  it('does not call the action for an item that has never been saved', () => {
    renderHook(() => useMenuItemCosts('t1', undefined, true, true))

    expect(getMenuItemCostAction).not.toHaveBeenCalled()
  })

  it('does not call the action when inventory is off for the tenant', () => {
    renderHook(() => useMenuItemCosts('t1', 'm1', false, true))

    expect(getMenuItemCostAction).not.toHaveBeenCalled()
  })

  it('reports no costs rather than breaking the editor when the load fails', async () => {
    getMenuItemCostAction.mockResolvedValue({ success: false, error: 'connection refused' })

    const { result } = renderHook(() => useMenuItemCosts('t1', 'm1', true, true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.optionRecipeCosts).toEqual({})
  })

  it('survives the action throwing outright', async () => {
    getMenuItemCostAction.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useMenuItemCosts('t1', 'm1', true, true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.optionRecipeCosts).toEqual({})
  })
})

describe('useMenuItemCosts and the costs permission', () => {
  it('never asks for costs on behalf of an account without costs', () => {
    renderHook(() => useMenuItemCosts('t1', 'm1', true, false))

    expect(getMenuItemCostAction).not.toHaveBeenCalled()
  })

  it('shows nothing, rather than breaking the editor, when the server refuses', async () => {
    // The action refuses without `costs` server-side too — a stale permission
    // on this side must degrade to "no costs", never to an error.
    getMenuItemCostAction.mockResolvedValue({
      success: false,
      error: 'Unauthorized: Missing permission for this feature',
    })

    const { result } = renderHook(() => useMenuItemCosts('t1', 'm1', true, true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.baseRecipeCost).toBeNull()
    expect(result.current.optionRecipeCosts).toEqual({})
  })

  it('drops costs already on screen when the permission goes away', async () => {
    getMenuItemCostAction.mockResolvedValue({ success: true, data: BREAKDOWN })
    const { result, rerender } = renderHook(
      ({ canSeeCosts }) => useMenuItemCosts('t1', 'm1', true, canSeeCosts),
      { initialProps: { canSeeCosts: true } },
    )
    await waitFor(() => expect(result.current.baseRecipeCost).toBe(30))

    rerender({ canSeeCosts: false })

    expect(result.current.baseRecipeCost).toBeNull()
  })
})

describe('useMenuItemCosts refresh', () => {
  it('re-reads the costs on demand, so saving a recipe updates the display', async () => {
    // Arrange — first load has no recipe cost, then a recipe is attached.
    getMenuItemCostAction
      .mockResolvedValueOnce({ success: true, data: { ...BREAKDOWN, modifierOptionCosts: {} } })
      .mockResolvedValueOnce({ success: true, data: BREAKDOWN })
    const { result } = renderHook(() => useMenuItemCosts('t1', 'm1', true, true))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Act
    act(() => result.current.refresh())

    // Assert
    await waitFor(() => expect(result.current.optionRecipeCosts).toEqual({ 'opt-large': 25 }))
  })
})
