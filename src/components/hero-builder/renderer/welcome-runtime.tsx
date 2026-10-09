'use client'

import { createContext, useContext } from 'react'

import type { EntryMode } from '@/lib/hero-builder/types'

/**
 * What a welcome-page design needs from the live store: who it is and how an
 * order starts. The storefront provides real handlers; the editor canvas and
 * the template gallery fall back to a sample store whose buttons do nothing.
 */
export interface WelcomeRuntime {
  storeName: string
  logoUrl: string | null
  /** Order types at least one branch can fulfil, in display order. */
  modes: readonly EntryMode[]
  /** Start an order of this type (the branch list, or straight to the menu). */
  onChooseMode: (mode: EntryMode) => void
  /** Start an order and leave the order type to checkout. */
  onStart: () => void
  /** The order types are still being fetched: hold their place, don't guess. */
  isLoadingModes?: boolean
}

const noop = () => {}

export const SAMPLE_WELCOME_RUNTIME: WelcomeRuntime = {
  storeName: 'Your store',
  logoUrl: null,
  modes: ['dine_in', 'pickup', 'delivery'],
  onChooseMode: noop,
  onStart: noop,
}

const WelcomeRuntimeContext = createContext<WelcomeRuntime | null>(null)

export const WelcomeRuntimeProvider = WelcomeRuntimeContext.Provider

/** The live runtime, or the sample one outside a welcome page. */
export function useWelcomeRuntime(): WelcomeRuntime {
  return useContext(WelcomeRuntimeContext) ?? SAMPLE_WELCOME_RUNTIME
}

/** `{store}` in welcome copy becomes the store's name — only where a store is known. */
export function useStoreNameToken(): string | null {
  return useContext(WelcomeRuntimeContext)?.storeName ?? null
}
