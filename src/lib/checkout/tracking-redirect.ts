/**
 * Where a customer goes after placing an order that has no Messenger handoff.
 *
 * When the order can go to Messenger, the thank-you screen has a job: it hands
 * the order over. Once that job is done — the countdown has opened Messenger —
 * or when there is no job at all — Messenger is off for the order type, or no
 * Facebook page is connected to send to — the customer is sent to the live
 * tracking page. The one exception is a Messenger order with auto-open turned
 * off: the customer sends that message by hand from the thank-you screen, so
 * leaving it would strand the order.
 *
 * The redirect only happens once the save has returned a tracking id AND
 * token. Until then — still saving, refused, lost, or a tenant without order
 * management — the confirmation screen stays, because it is the only place
 * those outcomes are explained.
 */

export interface TrackingRedirectInput {
  isCheckoutComplete: boolean
  isMessengerEnabled: boolean
  /** The resolved m.me link; empty when no page is connected. */
  messengerUrl: string | null | undefined
  /** The countdown opens Messenger for the customer (tenant + order type allow it). */
  isMessengerAutoOpen: boolean
  /** The countdown has already opened Messenger in another tab/app. */
  hasOpenedMessenger: boolean
  isKiosk: boolean
  trackingOrderId: string | null
  trackingToken: string | null
}

export function buildOrderTrackingPath(tenantSlug: string, orderId: string, trackingToken: string): string {
  return `/${tenantSlug}/order/${orderId}?t=${encodeURIComponent(trackingToken)}`
}

/** The tracking path to replace the thank-you screen with, or null to stay. */
export function resolveTrackingRedirect(tenantSlug: string, input: TrackingRedirectInput): string | null {
  if (!input.isCheckoutComplete || input.isKiosk) return null
  const hasMessengerHandoff = input.isMessengerEnabled && Boolean(input.messengerUrl)
  if (hasMessengerHandoff && !(input.isMessengerAutoOpen && input.hasOpenedMessenger)) return null
  if (!input.trackingOrderId || !input.trackingToken) return null
  return buildOrderTrackingPath(tenantSlug, input.trackingOrderId, input.trackingToken)
}
