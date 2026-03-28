import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { UpsellOrchestratorProvider, useUpsellOrchestrator } from '@/lib/upsell-orchestrator'

function wrapper({ children }: { children: React.ReactNode }) {
  return <UpsellOrchestratorProvider>{children}</UpsellOrchestratorProvider>
}

describe('useUpsellOrchestrator', () => {
  it('starts with full budget (2)', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    expect(result.current.budgetRemaining).toBe(2)
  })

  it('allows first upsell prompt', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    expect(result.current.canShowUpsell('upgrade')).toBe(true)
  })

  it('decrements budget when prompt is recorded', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    act(() => { result.current.recordShown('upgrade', 'item-1') })
    expect(result.current.budgetRemaining).toBe(1)
  })

  it('blocks mid-flow prompts when budget is spent', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    act(() => { result.current.recordShown('upgrade', 'item-1') })
    act(() => { result.current.recordShown('pair', 'item-2') })
    expect(result.current.canShowUpsell('bundle')).toBe(false)
  })

  it('always allows checkout picks regardless of budget', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    act(() => { result.current.recordShown('upgrade', 'item-1') })
    act(() => { result.current.recordShown('pair', 'item-2') })
    expect(result.current.canShowUpsell('checkout')).toBe(true)
  })

  it('forfeits remaining budget on dismiss', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    act(() => { result.current.recordShown('upgrade', 'item-1') })
    act(() => { result.current.recordDismissed() })
    expect(result.current.budgetRemaining).toBe(0)
    expect(result.current.canShowUpsell('pair')).toBe(false)
    expect(result.current.canShowUpsell('checkout')).toBe(true)
  })

  it('tracks suggested items to avoid repeats', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    act(() => { result.current.recordShown('upgrade', 'item-1') })
    expect(result.current.wasItemSuggested('item-1')).toBe(true)
    expect(result.current.wasItemSuggested('item-2')).toBe(false)
  })

  it('filters out already-suggested items', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    act(() => { result.current.recordShown('upgrade', 'item-1') })
    const filtered = result.current.filterSuggestedItems([
      { id: 'item-1', name: 'A' },
      { id: 'item-2', name: 'B' },
      { id: 'item-3', name: 'C' },
    ])
    expect(filtered).toHaveLength(2)
    expect(filtered.map(i => i.id)).toEqual(['item-2', 'item-3'])
  })
})
