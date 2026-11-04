'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'

/**
 * What a designed checkout's blocks read: the page's one useCheckout() value.
 * The blocks only present it — every check, price and submit stays in the hook.
 */
export interface CheckoutBlocksValue {
  checkout: UseCheckoutReturn
}

const CheckoutBlocksContext = createContext<CheckoutBlocksValue | null>(null)

export function CheckoutBlocksProvider({ value, children }: { value: CheckoutBlocksValue; children: ReactNode }) {
  return <CheckoutBlocksContext.Provider value={value}>{children}</CheckoutBlocksContext.Provider>
}

/** The checkout behind the blocks, or null outside a designed checkout. */
export function useCheckoutBlocks(): CheckoutBlocksValue | null {
  return useContext(CheckoutBlocksContext)
}
