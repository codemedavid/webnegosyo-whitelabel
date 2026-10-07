/**
 * Where a placed order is handed to Messenger, and whether the platform sends
 * it there itself.
 *
 * Lifted out of `useCheckout.handleCheckout`. No request: the connected page's
 * public id is resolved on the server with the rest of the checkout config
 * (see CheckoutConfig.facebookPageId).
 */
import { generateMessengerDirectUrl, generateMessengerUrl } from '@/lib/cart-utils'
import type { Tenant } from '@/types/database'

export type MessengerHandoffTenant = Pick<
  Tenant,
  'facebook_page_id' | 'messenger_username' | 'messenger_page_id' | 'messenger_redirect_mode'
>

export interface MessengerHandoffInput {
  tenant: MessengerHandoffTenant
  /** The connected Facebook page's public id, read with the page. */
  facebookPageId: string | null
  /** Messenger is on for this order type (and this is not a kiosk). */
  isMessengerEnabled: boolean
  /** The order message to prefill. */
  message: string
}

export interface MessengerHandoff {
  /** The link the confirmation screen opens, or null when there is none. */
  messengerUrl: string | null
  /** Direct mode opens the page without a prefilled message. */
  isDirectMode: boolean
  /**
   * A real connected page (not a typed username or page id), so the platform
   * can send the order to it proactively once saved.
   */
  isFacebookPageConnected: boolean
}

export function resolveMessengerHandoff({
  tenant,
  facebookPageId,
  isMessengerEnabled,
  message,
}: MessengerHandoffInput): MessengerHandoff {
  const pageId: string | null = facebookPageId || tenant.messenger_username || tenant.messenger_page_id || null

  const isFacebookPageConnected =
    tenant.facebook_page_id !== null &&
    tenant.facebook_page_id !== undefined &&
    pageId !== null &&
    pageId !== tenant.messenger_username &&
    pageId !== tenant.messenger_page_id

  const isDirectMode = tenant.messenger_redirect_mode === 'direct'
  const hasPage = isMessengerEnabled && pageId !== null && pageId.trim() !== ''

  let messengerUrl: string | null = null
  if (hasPage) {
    messengerUrl = isDirectMode ? generateMessengerDirectUrl(pageId) : generateMessengerUrl(pageId, message)
  }

  return { messengerUrl, isDirectMode, isFacebookPageConnected }
}

export interface ProactiveSendInput {
  isMessengerEnabled: boolean
  handoff: MessengerHandoff
  orderId: string | null | undefined
  orderToken: string | null | undefined
}

/** Whether a saved order is posted to the connected page by the platform. */
export function shouldSendOrderProactively({
  isMessengerEnabled,
  handoff,
  orderId,
  orderToken,
}: ProactiveSendInput): boolean {
  return Boolean(
    isMessengerEnabled && !handoff.isDirectMode && handoff.isFacebookPageConnected && orderId && orderToken
  )
}
