/**
 * "What do customers always order together?" — market-basket analysis over
 * the order counts in `basket-stats`.
 *
 * Raw co-occurrence alone misleads: rice is in most orders, so it shares an
 * order with everything. Each pair therefore carries three measures:
 *
 * - `share`   — the partner is in this fraction of the anchor's orders
 *               (confidence, read in the stronger direction);
 * - `support` — the fraction of ALL orders holding both;
 * - `lift`    — how much more often they meet than chance would put them
 *               together. Below 1 is coincidence, not a pattern.
 *
 * Pure and deterministic.
 */

import type { BasketStats } from './basket-stats'

export type PairStrength = 'always' | 'often' | 'sometimes'

export interface PickedTogetherPair {
  /** The item whose orders most often include the partner. */
  anchorId: string
  partnerId: string
  /** Orders holding both. */
  together: number
  /** together / anchor orders, 0–1. */
  share: number
  /** together / partner orders, 0–1. */
  reverseShare: number
  /** together / all orders, 0–1. */
  support: number
  /** Observed / expected by chance. 1 = no relationship. */
  lift: number
  strength: PairStrength
}

export interface PickedTogetherOptions {
  limit: number
  /** Fewer shared orders than this is coincidence. Default 2. */
  minTogether?: number
  /** Drop pairs that meet no more often than chance. Default true. */
  aboveChanceOnly?: boolean
}

const DEFAULT_MIN_TOGETHER = 2
const ALWAYS_SHARE = 0.6
const OFTEN_SHARE = 0.3

export function pairStrength(share: number): PairStrength {
  if (share >= ALWAYS_SHARE) return 'always'
  if (share >= OFTEN_SHARE) return 'often'
  return 'sometimes'
}

function round(value: number, places = 4): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function toPair(stats: BasketStats, a: string, b: string, together: number): PickedTogetherPair | null {
  const aOrders = stats.itemOrders.get(a) ?? 0
  const bOrders = stats.itemOrders.get(b) ?? 0
  if (aOrders === 0 || bOrders === 0 || stats.orderCount === 0) return null

  const aShare = together / aOrders
  const bShare = together / bOrders
  // Orient toward the stronger direction; ties keep the key order (a < b).
  const isAAnchor = aShare >= bShare
  const share = isAAnchor ? aShare : bShare
  const support = together / stats.orderCount
  const lift = support / ((aOrders / stats.orderCount) * (bOrders / stats.orderCount))

  return {
    anchorId: isAAnchor ? a : b,
    partnerId: isAAnchor ? b : a,
    together,
    share: round(share),
    reverseShare: round(isAAnchor ? bShare : aShare),
    support: round(support),
    lift: round(lift, 2),
    strength: pairStrength(share),
  }
}

export function findPickedTogether(stats: BasketStats, options: PickedTogetherOptions): PickedTogetherPair[] {
  const minTogether = options.minTogether ?? DEFAULT_MIN_TOGETHER
  const aboveChanceOnly = options.aboveChanceOnly ?? true

  const pairs: PickedTogetherPair[] = []
  for (const [key, together] of stats.pairOrders) {
    if (together < minTogether) continue
    const [a, b] = key.split('|')
    const pair = toPair(stats, a, b, together)
    if (!pair) continue
    if (aboveChanceOnly && pair.lift <= 1) continue
    pairs.push(pair)
  }

  return pairs
    .sort((x, y) =>
      y.together - x.together ||
      y.lift - x.lift ||
      x.anchorId.localeCompare(y.anchorId) ||
      x.partnerId.localeCompare(y.partnerId)
    )
    .slice(0, options.limit)
}
