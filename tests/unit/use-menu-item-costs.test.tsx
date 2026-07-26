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
    const { result } = renderHook(() => useMenuItemCosts('t1', 'm1', true))

    // Assert
    await waitFor(() => expect(result.current.optionRecipeCosts).toEqual({ 'opt-large': 25 }))
    expect(getMenuItemCostAction).toHaveBeenCalledWith('t1', 'm1')
  })

  it('does not call the action for an item that has never been saved', () => {
    renderHook(() => useMenuItemCosts('t1', undefined, true))

    expect(getMenuItemCostAction).not.toHaveBeenCalled()
  })

  it('does not call the action when inventory is off for the tenant', () => {
    renderHook(() => useMenuItemCosts('t1', 'm1', false))

    expect(getMenuItemCostAction).not.toHaveBeenCalled()
  })

  it('reports no costs rather than breaking the editor when the load fails', async () => {
    getMenuItemCostAction.mockResolvedValue({ success: false, error: 'connection refused' })

    const { result } = renderHook(() => useMenuItemCosts('t1', 'm1', true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.optionRecipeCosts).toEqual({})
  })

  it('survives the action throwing outright', async () => {
    getMenuItemCostAction.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useMenuItemCosts('t1', 'm1', true))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.optionRecipeCosts).toEqual({})
  })
})

describe('useMenuItemCosts refresh', () => {
  it('re-reads the costs on demand, so saving a recipe updates the display', async () => {
    // Arrange — first load has no recipe cost, then a recipe is attached.
    getMenuItemCostAction
      .mockResolvedValueOnce({ success: true, data: { ...BREAKDOWN, modifierOptionCosts: {} } })
      .mockResolvedValueOnce({ success: true, data: BREAKDOWN })
    const { result } = renderHook(() => useMenuItemCosts('t1', 'm1', true))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Act
    act(() => result.current.refresh())

    // Assert
    await waitFor(() => expect(result.current.optionRecipeCosts).toEqual({ 'opt-large': 25 }))
  })
})
