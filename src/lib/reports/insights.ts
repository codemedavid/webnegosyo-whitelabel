/**
 * The sentence above a sales report: what happened, in words (plan §4
 * "Insight first").
 *
 * Deterministic templates, not a language model: the same numbers always give
 * the same sentence, every figure in it is one the screen also shows, and it
 * can be tested to the letter. Honesty rules are built in:
 * - a period still running says "so far";
 * - a comparison with nothing to compare never becomes "+100%";
 * - a change under half a percent is "about the same", not "up 0%";
 * - the standout-bucket clause is skipped when nothing really stands out.
 */
import type { ComparePeriod, ReportPeriod } from '@/lib/reports/period'
import { formatCount, formatMoney, formatRatio } from '@/lib/reports/format'
import { growthRatio } from '@/lib/reports/sales-model'

export interface InsightBucket {
  key: string
  label: string
  netCents: number
}

export interface SalesInsightInput {
  period: Pick<ReportPeriod, 'phrase' | 'isPartial' | 'grain'>
  /** null = comparison off. */
  compare: Pick<ComparePeriod, 'phrase'> | null
  current: { netCents: number; orders: number }
  /** null = unknown or off. */
  previous: { netCents: number; orders: number } | null
  buckets: readonly InsightBucket[]
}

export interface SalesInsight {
  headline: string
  detail: string | null
}

/** Below this change the two periods read as the same. */
const SAME_BELOW = 0.005
/** A bucket under this share of the total does not "stand out". */
const STANDOUT_FROM_SHARE = 0.2
/** How far a share may sit from a fraction and still be called by its name. */
const SHARE_WORDS_TOLERANCE = 0.03

const SHARE_WORDS: ReadonlyArray<readonly [number, string]> = [
  [1 / 4, 'a quarter'],
  [1 / 3, 'a third'],
  [1 / 2, 'half'],
  [2 / 3, 'two thirds'],
  [3 / 4, 'three quarters'],
]

/** 0.33 -> "a third". Null when no everyday fraction fits; the caller uses a percent. */
export function shareWords(share: number): string | null {
  const match = SHARE_WORDS.find(([fraction]) => Math.abs(share - fraction) <= SHARE_WORDS_TOLERANCE + 1e-9)
  return match ? match[1] : null
}

function withoutLeadingOn(phrase: string): string {
  return phrase.replace(/^on /, '')
}

function amountPhrase(input: SalesInsightInput): string {
  const amount = formatMoney(input.current.netCents)
  return input.period.isPartial ? `${amount} so far ${input.period.phrase}` : `${amount} ${input.period.phrase}`
}

function emptyHeadline(input: SalesInsightInput): string {
  return `No sales ${input.period.phrase}${input.period.isPartial ? ' yet' : ''}.`
}

function ordersHeadline(input: SalesInsightInput): string {
  const { orders } = input.current
  return `${amountPhrase(input)} from ${formatCount(orders)} ${orders === 1 ? 'order' : 'orders'}.`
}

function comparedHeadline(
  input: SalesInsightInput,
  compare: Pick<ComparePeriod, 'phrase'>,
  previous: { netCents: number; orders: number },
): string {
  const growth = growthRatio(input.current.netCents, previous.netCents)
  const lead = amountPhrase(input)

  if (growth === null) {
    return `${lead}, and ${withoutLeadingOn(compare.phrase)} had no sales to compare with.`
  }
  if (Math.abs(growth) < SAME_BELOW) {
    return `${lead}, about the same as ${withoutLeadingOn(compare.phrase)}.`
  }
  const direction = growth > 0 ? 'up' : 'down'
  return `${lead}, ${direction} ${formatRatio(Math.abs(growth))} ${compare.phrase}.`
}

function buildHeadline(input: SalesInsightInput): string {
  if (input.current.netCents <= 0 && input.current.orders === 0) return emptyHeadline(input)
  if (!input.compare || !input.previous) return ordersHeadline(input)
  return comparedHeadline(input, input.compare, input.previous)
}

function topBucket(buckets: readonly InsightBucket[]): InsightBucket {
  return buckets.reduce((best, candidate) => (candidate.netCents > best.netCents ? candidate : best))
}

function buildDetail(input: SalesInsightInput): string | null {
  const { grain } = input.period
  if (grain === 'month') return null

  const withSales = input.buckets.filter((bucket) => bucket.netCents > 0)
  if (withSales.length < 2) return null

  const top = topBucket(withSales)
  if (grain === 'hour') return `Your busiest hour was ${top.label}.`

  const total = withSales.reduce((sum, bucket) => sum + bucket.netCents, 0)
  const share = top.netCents / total
  if (share < STANDOUT_FROM_SHARE) return null

  return `${top.label} brought in ${shareWords(share) ?? formatRatio(share)} of it.`
}

export function buildSalesInsight(input: SalesInsightInput): SalesInsight {
  const headline = buildHeadline(input)
  const hasNoSales = input.current.netCents <= 0 && input.current.orders === 0
  return { headline, detail: hasNoSales ? null : buildDetail(input) }
}
