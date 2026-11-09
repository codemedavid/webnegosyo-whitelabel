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

import type { ConfirmationRedirectSetting } from '@/lib/page-designer/page-mode'

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

/** The order is handed to Messenger from the thank-you screen (Messenger on AND a page to send to). */
export function hasMessengerHandoff(input: Pick<TrackingRedirectInput, 'isMessengerEnabled' | 'messengerUrl'>): boolean {
  return input.isMessengerEnabled && Boolean(input.messengerUrl)
}

/** The tracking path to replace the thank-you screen with, or null to stay. */
export function resolveTrackingRedirect(tenantSlug: string, input: TrackingRedirectInput): string | null {
  if (!input.isCheckoutComplete || input.isKiosk) return null
  if (hasMessengerHandoff(input) && !(input.isMessengerAutoOpen && input.hasOpenedMessenger)) return null
  if (!input.trackingOrderId || !input.trackingToken) return null
  return buildOrderTrackingPath(tenantSlug, input.trackingOrderId, input.trackingToken)
}

// ── The owner's hand-off setting ────────────────────────────────────────────

/**
 * What the thank-you screen does once tracking is reachable:
 *  - `none`      nothing is reachable yet (saving, failed, refused, kiosk,
 *                Messenger still to send) — exactly today's "stay";
 *  - `redirect`  replace it with tracking now;
 *  - `countdown` show it, then replace it after `seconds`;
 *  - `stay`      the owner keeps it on screen until the customer taps Track.
 */
export type ConfirmationHandoff =
  | { kind: 'none' }
  | { kind: 'redirect'; path: string }
  | { kind: 'countdown'; path: string; seconds: number }
  | { kind: 'stay'; path: string }

const NO_HANDOFF: ConfirmationHandoff = { kind: 'none' }

/**
 * Applies the owner's "after the order is placed" setting on top of
 * `resolveTrackingRedirect`. The setting only ever DELAYS a redirect that
 * would have happened: every case that stays today (no tracking path) still
 * stays, and a Messenger hand-off that has done its job still moves on
 * straight away — that customer has already left for Messenger.
 */
export function resolveConfirmationHandoff(
  trackingPath: string | null,
  input: Pick<TrackingRedirectInput, 'isMessengerEnabled' | 'messengerUrl'>,
  setting: ConfirmationRedirectSetting,
): ConfirmationHandoff {
  if (!trackingPath) return NO_HANDOFF
  if (hasMessengerHandoff(input) || setting.mode === 'instant') return { kind: 'redirect', path: trackingPath }
  if (setting.mode === 'countdown') return { kind: 'countdown', path: trackingPath, seconds: setting.seconds }
  return { kind: 'stay', path: trackingPath }
}
