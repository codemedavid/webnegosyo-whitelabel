/**
 * When a receipt may still claim its stamp.
 *
 * A stamp is claimed by putting a phone number on the order, and the tracking
 * QR that authorizes that lives on a printed receipt. A receipt outlives the
 * order: anyone who picks one off a table could otherwise scan it and claim a
 * stranger's visit. So the window closes when the order is handed over — the
 * claim has to happen while the customer is still waiting for their food.
 *
 * Pure, and the closed set is imported rather than restated: an order must
 * stop being claimable at exactly the instant it starts counting as a visit.
 */

import { ONLINE_FULFILLED_STATUSES, REVERSED_STATUSES } from '@/lib/customer-order-facts'

export type ClaimWindowReason = 'completed' | 'cancelled'

export type ClaimWindow =
  | { state: 'open' }
  | { state: 'closed'; reason: ClaimWindowReason }

/** What the customer is told. Deliberately says nothing about which order. */
export const CLAIM_WINDOW_CLOSED_MESSAGE =
  'This order is finished, so stamp claiming is closed. Give your number at the counter next time and your stamp is automatic.'

const OPEN: ClaimWindow = { state: 'open' }

function normalize(status: string | null | undefined): string {
  return status?.trim().toLowerCase() ?? ''
}

export function evaluateClaimWindow(status: string | null | undefined): ClaimWindow {
  const value = normalize(status)
  if (REVERSED_STATUSES.has(value)) return { state: 'closed', reason: 'cancelled' }
  if (ONLINE_FULFILLED_STATUSES.has(value)) return { state: 'closed', reason: 'completed' }
  // Anything else — including a status this deployment does not know — is an
  // order still in flight. Refusing an unknown status would cost real
  // customers real stamps, which is worse than the receipt-finder it stops.
  return OPEN
}

export function isClaimWindowOpen(status: string | null | undefined): boolean {
  return evaluateClaimWindow(status).state === 'open'
}
