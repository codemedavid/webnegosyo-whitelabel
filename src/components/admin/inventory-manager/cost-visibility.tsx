'use client'

/**
 * Whether the account looking may see peso costs (`costs`, plan §6.3).
 *
 * A context rather than a prop because the cost displays sit several layers
 * below the screen that knows the caller, behind components that have no
 * business carrying a permission (the recipe workbench, the modifier groups
 * editor, the recipe disclosure). The Inventory page and the dish editor each
 * provide it once from the server's answer.
 *
 * With NO provider the answer is "no": a mount nobody thought about hides the
 * figure rather than leaking it. Hidden means ABSENT — never ₱0.
 */

import { createContext, useContext, type ReactNode } from 'react'

const CostVisibilityContext = createContext(false)

interface CostVisibilityProviderProps {
  canSeeCosts: boolean
  children: ReactNode
}

export function CostVisibilityProvider({ canSeeCosts, children }: CostVisibilityProviderProps) {
  return (
    <CostVisibilityContext.Provider value={canSeeCosts}>{children}</CostVisibilityContext.Provider>
  )
}

export function useCanSeeCosts(): boolean {
  return useContext(CostVisibilityContext)
}
