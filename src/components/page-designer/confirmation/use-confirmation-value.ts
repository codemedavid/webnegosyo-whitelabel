'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { isOrderSaveFailed } from '@/lib/checkout/order-save-outcome'
import { buildOrderTrackingPath } from '@/lib/checkout/tracking-redirect'
import { kioskReturnPath } from '@/lib/kiosk/kiosk-mode'
import { storeAddressToken } from '@/lib/page-designer/store-address'

import type { ConfirmationBlocksValue } from './confirmation-context'
import { useTrackingCountdown } from './use-tracking-countdown'

/** Copy the order message, telling the customer whether it worked. */
export async function copyOrderMessage(message: string, successText: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(message)
    toast.success(successText)
  } catch {
    toast.error('Failed to copy message')
  }
}

type ConfirmationSource = Pick<
  UseCheckoutReturn,
  | 'tenant' | 'completedOrderData' | 'redirectCountdown' | 'trackingOrderId' | 'trackingToken'
  | 'messageExpanded' | 'setMessageExpanded' | 'router' | 'tenantSlug' | 'messengerEnabled'
  | 'isKiosk' | 'kioskCountdown' | 'orderSaveFailed' | 'orderSaveNotice'
> & Partial<Pick<UseCheckoutReturn, 'confirmationHandoff' | 'branding' | 'selectedOrderTypeData' | 'outlet'>>

/**
 * The thank-you page's context value from useCheckout, plus the owner's
 * tracking countdown. Null until there is a completed order to show.
 */
export function useConfirmationValue(checkout: ConfirmationSource, grandTotal: number): ConfirmationBlocksValue | null {
  const {
    tenant, completedOrderData: order, redirectCountdown, trackingOrderId, trackingToken,
    messageExpanded, setMessageExpanded, router, tenantSlug, messengerEnabled,
    isKiosk, kioskCountdown, orderSaveFailed, orderSaveNotice, confirmationHandoff, branding, selectedOrderTypeData, outlet,
  } = checkout

  const replace = useCallback((path: string) => router.replace(path), [router])
  const countdown = useTrackingCountdown(confirmationHandoff, replace)

  if (!tenant || !order) return null

  const branch = outlet?.choices?.find((entry) => entry.outlet.id === outlet.selectedOutletId)?.outlet

  return {
    storeName: tenant.name,
    storeAddress: storeAddressToken(tenant, branch),
    orderKind: selectedOrderTypeData?.type ?? null,
    order,
    grandTotal,
    isMessengerEnabled: messengerEnabled,
    messengerCountdown: redirectCountdown,
    isMessageExpanded: messageExpanded,
    onToggleMessage: () => setMessageExpanded(!messageExpanded),
    onOpenMessenger: () => window.open(order.messengerUrl, '_blank', 'noopener,noreferrer'),
    onCopyMessage: (successText) => void copyOrderMessage(order.messengerMessage, successText),
    isKiosk,
    kioskCountdown,
    onStartNewOrder: () => router.push(kioskReturnPath(tenantSlug)),
    saveNotice: orderSaveNotice ?? null,
    // One source of truth for "this screen is lying". `orderSaveNotice` carries
    // the detail; the boolean is kept because designs and tests predate it.
    hasOrderSaveFailed: isOrderSaveFailed({ orderSaveFailed, orderSaveNotice }),
    // The Messenger message is only a recovery when there is somewhere to send
    // it: the tenant has Messenger on AND a page resolved to redirect to.
    hasMessengerFallback: Boolean(messengerEnabled && order.messengerUrl),
    canTrack: Boolean(trackingOrderId && trackingToken),
    // Leaving by hand stops the countdown, so it can't pull the customer to tracking after they chose.
    onTrack: () => {
      countdown.stay?.()
      if (trackingOrderId && trackingToken) router.push(buildOrderTrackingPath(tenantSlug, trackingOrderId, trackingToken))
    },
    onBackToMenu: () => {
      countdown.stay?.()
      router.push(`/${tenantSlug}/menu`)
    },
    trackingCountdown: countdown.secondsLeft,
    onStayHere: countdown.stay,
    // The same source checkoutThemeStyle(checkout) paints the page root from.
    themeSource: { tenant, branding },
  }
}
