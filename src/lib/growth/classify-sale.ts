/**
 * The one place the Customer Growth plan's customer-type rules live.
 *
 * Every completed sale lands in exactly one bucket, decided at the moment of the
 * sale and never rewritten by later visits:
 *
 *   Guest      no phone on the order
 *   New        has a phone; this is that phone's first completed sale here
 *   Member     has ordered before AND already held a stamp card before this sale
 *   Returning  has ordered before, no card yet
 *
 * "Won back" is detail inside Returning/Member: the previous visit was more
 * than {@link WON_BACK_AFTER_DAYS} days earlier.
 *
 * Phase 2 of the plan moves this into the `sales_facts` writer; the rules stay
 * here so both paths classify identically.
 */

import type { CustomerVisit } from '@/lib/dashboard/sale-record'

export type GrowthBucket = 'guest' | 'new' | 'returning' | 'member'

export const GROWTH_BUCKETS: readonly GrowthBucket[] = ['guest', 'new', 'returning', 'member']

/** Merchant-facing names, from the plan's customer model. */
export const GROWTH_BUCKET_LABELS: Readonly<Record<GrowthBucket, string>> = {
  guest: 'Unknown guests',
  new: 'First-timers',
  returning: 'Regulars',
  member: 'Members',
}

export const WON_BACK_AFTER_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

export interface SaleClassification {
  bucket: GrowthBucket
  wonBack: boolean
}

export function classifySale(
  sale: { phone: string | null; at: number },
  previousVisitAt: number | null,
  cardHeldSince: number | null,
): SaleClassification {
  if (!sale.phone) return { bucket: 'guest', wonBack: false }
  if (previousVisitAt === null || previousVisitAt >= sale.at) return { bucket: 'new', wonBack: false }

  const wonBack = sale.at - previousVisitAt > WON_BACK_AFTER_DAYS * DAY_MS
  const isMember = cardHeldSince !== null && cardHeldSince < sale.at
  return { bucket: isMember ? 'member' : 'returning', wonBack }
}

export interface VisitIndex {
  /** The latest completed visit strictly before `at`, or null. */
  previousVisit(phone: string, at: number): number | null
  /** Every completed visit of a phone, ascending. */
  visitsOf(phone: string): readonly number[]
  phones(): IterableIterator<string>
}

/** Latest value in an ascending list that is strictly below `limit`. */
function latestBefore(sorted: readonly number[], limit: number): number | null {
  let low = 0
  let high = sorted.length - 1
  let found: number | null = null
  while (low <= high) {
    const mid = (low + high) >> 1
    if (sorted[mid] < limit) {
      found = sorted[mid]
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

export function buildVisitIndex(visits: readonly CustomerVisit[]): VisitIndex {
  const byPhone = new Map<string, number[]>()
  for (const visit of visits) {
    const list = byPhone.get(visit.phone) ?? []
    list.push(visit.at)
    byPhone.set(visit.phone, list)
  }
  for (const list of byPhone.values()) list.sort((a, b) => a - b)

  return {
    previousVisit: (phone, at) => latestBefore(byPhone.get(phone) ?? [], at),
    visitsOf: (phone) => byPhone.get(phone) ?? [],
    phones: () => byPhone.keys(),
  }
}
