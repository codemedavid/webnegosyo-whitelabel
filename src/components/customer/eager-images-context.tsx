'use client'

/**
 * Whether cards in this subtree may load their images eagerly.
 *
 * The menu client draws the layout twice when a tenant has a different card
 * template for phones, hiding one copy with CSS. A `loading="eager"` image
 * inside a display:none subtree still downloads, so the copy hidden on phones
 * opts out here and its above-the-fold cards stay lazy. Defaults to allowed:
 * a single-copy render needs no provider.
 */

import { createContext, useContext, type ReactNode } from 'react'

const EagerImagesContext = createContext(true)

interface EagerImagesProviderProps {
  enabled: boolean
  children: ReactNode
}

export function EagerImagesProvider({ enabled, children }: EagerImagesProviderProps) {
  return <EagerImagesContext.Provider value={enabled}>{children}</EagerImagesContext.Provider>
}

export function useEagerImages(): boolean {
  return useContext(EagerImagesContext)
}
