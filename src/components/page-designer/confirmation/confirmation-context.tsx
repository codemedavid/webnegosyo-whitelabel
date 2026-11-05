'use client'

/**
 * Everything the thank-you page's parts read: the frozen order, the tracking
 * hand-off, Messenger, kiosk and the save outcome. ONE value feeds both the
 * standard page and a designed one (and, with sample data, the editor), so a
 * part never reaches into useCheckout itself.
 */

import { createContext, useContext, type ReactNode } from 'react'

import type { CompletedOrderData } from '@/lib/checkout/completed-order'
import type { OrderSaveNotice } from '@/lib/checkout/order-save-outcome'

export interface ConfirmationBlocksValue {
  storeName: string
  order: CompletedOrderData
  /** The order's grand total (snapshot parts through computeOrderTotals) — summary and `{total}` agree. */
  grandTotal: number
  /** Messenger is on for this order (never on a kiosk). */
  isMessengerEnabled: boolean
  /** Seconds left before Messenger opens; 0/null once it has (or never will). */
  messengerCountdown: number | null
  isMessageExpanded: boolean
  onToggleMessage: () => void
  onOpenMessenger: () => void
  onCopyMessage: (successText: string) => void
  isKiosk: boolean
  kioskCountdown: number | null
  onStartNewOrder: () => void
  saveNotice: OrderSaveNotice | null
  /** The optimistic screen was wrong: the order is lost or refused. */
  hasOrderSaveFailed: boolean
  /** The Messenger message is a real recovery (Messenger on AND a page to send to). */
  hasMessengerFallback: boolean
  /** The save returned an id + token, so Track order has somewhere to go. */
  canTrack: boolean
  onTrack: () => void
  onBackToMenu: () => void
  /** Seconds left before the owner's countdown opens tracking; null = no countdown running. */
  trackingCountdown: number | null
  /** Stops that countdown ("Stay on this page"); null when there is none. */
  onStayHere: (() => void) | null
}

const ConfirmationBlocksContext = createContext<ConfirmationBlocksValue | null>(null)

export function ConfirmationBlocksProvider({ value, children }: { value: ConfirmationBlocksValue; children: ReactNode }) {
  return <ConfirmationBlocksContext.Provider value={value}>{children}</ConfirmationBlocksContext.Provider>
}

export function useConfirmationBlocks(): ConfirmationBlocksValue | null {
  return useContext(ConfirmationBlocksContext)
}
