'use client'

import { createContext, useContext, useCallback, useState, useRef, type ReactNode } from 'react'

const MAX_MID_FLOW_PROMPTS = 2

type UpsellType = 'upgrade' | 'bundle' | 'pair' | 'checkout'

interface UpsellOrchestratorValue {
  budgetRemaining: number
  canShowUpsell: (type: UpsellType) => boolean
  recordShown: (type: UpsellType, itemId: string) => void
  recordDismissed: () => void
  wasItemSuggested: (itemId: string) => boolean
  filterSuggestedItems: <T extends { id: string }>(items: T[]) => T[]
}

const UpsellOrchestratorContext = createContext<UpsellOrchestratorValue>({
  budgetRemaining: MAX_MID_FLOW_PROMPTS,
  canShowUpsell: () => true,
  recordShown: () => {},
  recordDismissed: () => {},
  wasItemSuggested: () => false,
  filterSuggestedItems: (items) => items,
})

export function useUpsellOrchestrator() {
  return useContext(UpsellOrchestratorContext)
}

export function UpsellOrchestratorProvider({ children }: { children: ReactNode }) {
  const [promptsShown, setPromptsShown] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const suggestedItemIdsRef = useRef(new Set<string>())

  const canShowUpsell = useCallback((type: UpsellType): boolean => {
    if (type === 'checkout') return true
    if (dismissed) return false
    if (promptsShown >= MAX_MID_FLOW_PROMPTS) return false
    return true
  }, [promptsShown, dismissed])

  const recordShown = useCallback((type: UpsellType, itemId: string) => {
    if (type !== 'checkout') {
      setPromptsShown(prev => prev + 1)
    }
    suggestedItemIdsRef.current.add(itemId)
  }, [])

  const recordDismissed = useCallback(() => {
    setDismissed(true)
    setPromptsShown(MAX_MID_FLOW_PROMPTS)
  }, [])

  const wasItemSuggested = useCallback((itemId: string): boolean => {
    return suggestedItemIdsRef.current.has(itemId)
  }, [])

  const filterSuggestedItems = useCallback(<T extends { id: string }>(items: T[]): T[] => {
    return items.filter(item => !suggestedItemIdsRef.current.has(item.id))
  }, [])

  const value: UpsellOrchestratorValue = {
    budgetRemaining: MAX_MID_FLOW_PROMPTS - promptsShown,
    canShowUpsell,
    recordShown,
    recordDismissed,
    wasItemSuggested,
    filterSuggestedItems,
  }

  return (
    <UpsellOrchestratorContext.Provider value={value}>
      {children}
    </UpsellOrchestratorContext.Provider>
  )
}
