/**
 * The pipeline page's filters, read from the query string: a creation window
 * and which offer the lead bought. Unknown values fall back to the default —
 * a mistyped URL shows the usual view, not an error.
 */

import type { PipelineLead } from './types'

export type PipelineRange = '7d' | '30d' | '90d' | 'all'
export type PipelineOffer = 'monthly' | 'one_time' | 'all'

export interface PipelineFilters {
  range: PipelineRange
  offer: PipelineOffer
}

/** The ₱999 funnel is the pipeline being automated; the old one-time leads would swamp it. */
export const DEFAULT_PIPELINE_FILTERS: PipelineFilters = { range: '30d', offer: 'monthly' }

export const PIPELINE_RANGES: Readonly<Record<PipelineRange, { label: string; days: number | null }>> = {
  '7d': { label: '7 days', days: 7 },
  '30d': { label: '30 days', days: 30 },
  '90d': { label: '90 days', days: 90 },
  all: { label: 'All time', days: null },
}

export const PIPELINE_OFFERS: Readonly<Record<PipelineOffer, string>> = {
  monthly: '₱999 monthly',
  one_time: 'One-time checkout',
  all: 'All offers',
}

const MONTHLY_TERM = 'monthly_subscription'
const DAY_MS = 24 * 60 * 60 * 1000

type QueryValue = string | string[] | undefined

function pick<K extends string>(table: Readonly<Record<K, unknown>>, value: QueryValue, fallback: K): K {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(table, value) ? (value as K) : fallback
}

export function parsePipelineFilters(params: { range?: QueryValue; offer?: QueryValue }): PipelineFilters {
  return {
    range: pick(PIPELINE_RANGES, params.range, DEFAULT_PIPELINE_FILTERS.range),
    offer: pick(PIPELINE_OFFERS, params.offer, DEFAULT_PIPELINE_FILTERS.offer),
  }
}

/** Inclusive lower bound on `created_at`, or null for all time. */
export function windowStartMs(range: PipelineRange, nowMs: number): number | null {
  const days = PIPELINE_RANGES[range].days
  return days === null ? null : nowMs - days * DAY_MS
}

/** Every term but the monthly one (and a missing term) is the one-time checkout. */
export function matchesOffer(paymentTerm: string | null, offer: PipelineOffer): boolean {
  if (offer === 'all') return true
  const isMonthly = paymentTerm === MONTHLY_TERM
  return offer === 'monthly' ? isMonthly : !isMonthly
}

export function filterPipelineLeads(
  leads: readonly PipelineLead[],
  filters: PipelineFilters,
  nowMs: number,
): PipelineLead[] {
  const startMs = windowStartMs(filters.range, nowMs)
  return leads.filter((lead) => {
    if (!matchesOffer(lead.paymentTerm, filters.offer)) return false
    if (startMs === null) return true
    const createdMs = Date.parse(lead.createdAt)
    return Number.isFinite(createdMs) && createdMs >= startMs
  })
}
