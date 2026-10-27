/**
 * Rate limits for the public Senior/PWD checkout calls, per client IP and
 * shared across instances (`action-rate-limit.ts`).
 *
 * A claim gives 20% off plus the VAT, to anyone who types an ID, with no
 * session — so the reads that price it and the orders that carry one are
 * bounded. Generous on purpose: a whole floor can share one restaurant Wi-Fi
 * IP, and PH carriers put many phones behind one CGNAT address. They FAIL OPEN
 * if Redis is down (the repo's rule for revenue paths): an outage must not
 * stop a senior from ordering. Ordinary orders are never counted here.
 *
 * Plain module (not 'use server'), so the limits can be exported and tested.
 */

import { checkActionRateLimit } from '@/lib/action-rate-limit'
import type { RateLimitOptions } from '@/lib/distributed-rate-limit'
import { parseCheckoutGovClaim } from './checkout-government'

export const GOV_SETUP_RATE_LIMIT: RateLimitOptions = { limit: 120, windowSec: 60 }
export const GOV_PREVIEW_RATE_LIMIT: RateLimitOptions = { limit: 60, windowSec: 60 }
export const GOV_CLAIM_ORDER_RATE_LIMIT: RateLimitOptions = { limit: 10, windowSec: 60 }

export const GOV_RATE_LIMITED_MESSAGE = 'Too many Senior/PWD checks. Please wait a moment and try again.'

export async function isGovSetupAllowed(tenantId: string): Promise<boolean> {
  return (await checkActionRateLimit(`gov-setup:${tenantId}`, GOV_SETUP_RATE_LIMIT)).allowed
}

export async function isGovPreviewAllowed(tenantId: string): Promise<boolean> {
  return (await checkActionRateLimit(`gov-preview:${tenantId}`, GOV_PREVIEW_RATE_LIMIT)).allowed
}

/**
 * The refusal for an order carrying a claim from an IP over its limit; null
 * otherwise. Only a claim the order will actually price is counted: a
 * malformed one, or one at a store that takes Senior/PWD only at the counter,
 * is ignored by the order (`priceCheckoutGovernment`), so counting it would
 * only lock that IP out of ordinary orders. An unreadable store setting fails
 * open, like the limit itself.
 */
export async function govClaimLimitRefusal(
  tenantId: string,
  claim: unknown,
  isOnlineClaimsEnabled: () => Promise<boolean>,
): Promise<string | null> {
  if (!parseCheckoutGovClaim(claim)) return null
  try {
    if (!(await isOnlineClaimsEnabled())) return null
  } catch (error) {
    console.error('[gov-claim-limit] could not read the online-claims setting; not counting', {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
  const rate = await checkActionRateLimit(`gov-claim-order:${tenantId}`, GOV_CLAIM_ORDER_RATE_LIMIT)
  return rate.allowed ? null : GOV_RATE_LIMITED_MESSAGE
}
