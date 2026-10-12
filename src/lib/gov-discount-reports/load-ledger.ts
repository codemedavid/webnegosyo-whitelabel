/**
 * Reading the sales book for one period — with the CALLER's session.
 *
 * Never the service role: `gov_discount_claims` is readable only by owners,
 * full-access staff and holders of `discount_review`, and a branch-locked
 * reviewer sees only their branch. Reading as the caller lets RLS decide all
 * of that, so this page cannot show more than the policy allows.
 *
 * Every read is bounded: the window on `(tenant_id, occurred_at)` (indexed),
 * paged past the 1000-row API cap, and capped at `MAX_LEDGER_ROWS`. Callers
 * get `isTruncated` and must say so on screen and refuse an incomplete export.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readPagesConcurrently, type PageResponse } from '@/lib/dashboard/paged-read'
import { CLAIM_COLUMNS, REVERSAL_COLUMNS, REVIEW_COLUMNS, mapRows, toLedgerClaim, toLedgerReview, toReversalStamp } from './rows'
import type { ReportPeriod } from './period'
import type { LedgerClaim, LedgerReview, OutletName, ReversalStamp } from './types'

export const MAX_LEDGER_ROWS = 20_000
export const MAX_REVIEW_ROWS = 20_000
export const MAX_LATER_REVERSALS = 5_000
const PAGE_SIZE = 1000
/** Slack for a register clock running ahead of the database's. */
const REVIEW_CLOCK_SLACK_MS = 24 * 60 * 60 * 1000
const CONCURRENCY = 4

type Db = SupabaseClient<Database>
type Row = Record<string, unknown>

export interface LedgerWindow {
  rows: LedgerClaim[]
  /** True when the cap was hit: totals and exports would be incomplete. */
  isTruncated: boolean
}

export interface LedgerPageData extends LedgerWindow {
  laterReversals: ReversalStamp[]
  reviews: LedgerReview[]
  outlets: OutletName[]
  /** False only when the store has never recorded a grant at all. */
  hasAnyClaims: boolean
}

function fail(context: string, message: string): never {
  throw new Error(`[gov-discount-reports] ${context}: ${message}`)
}

const asPage = (response: { data: unknown; error: { message: string } | null }): PageResponse<Row> => ({
  data: (response.data as Row[] | null) ?? null,
  error: response.error,
})

/** Every row (grants and reversals) recorded in the window, newest first. */
export async function loadLedgerWindow(db: Db, tenantId: string, period: ReportPeriod): Promise<LedgerWindow> {
  const result = await readPagesConcurrently<Row>(
    (from, to) =>
      db
        .from('gov_discount_claims')
        .select(CLAIM_COLUMNS)
        .eq('tenant_id', tenantId)
        .gte('occurred_at', period.startIso)
        .lt('occurred_at', period.endIso)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
        .then(asPage),
    { pageSize: PAGE_SIZE, maxRows: MAX_LEDGER_ROWS, concurrency: CONCURRENCY },
  )
  if (result.error) fail('claims', result.error)
  return { rows: mapRows(result.rows, toLedgerClaim), isTruncated: result.truncated }
}

/** Reversals recorded AFTER the window, so an old grant shows it was taken back. */
async function loadLaterReversals(db: Db, tenantId: string, period: ReportPeriod, nowMs: number): Promise<ReversalStamp[]> {
  if (Date.parse(period.endIso) > nowMs) return []
  const result = await readPagesConcurrently<Row>(
    (from, to) =>
      db
        .from('gov_discount_claims')
        .select(REVERSAL_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('event', 'reversed')
        .gte('occurred_at', period.endIso)
        .order('occurred_at', { ascending: true })
        .range(from, to)
        .then(asPage),
    { pageSize: PAGE_SIZE, maxRows: MAX_LATER_REVERSALS, concurrency: CONCURRENCY },
  )
  if (result.error) fail('later reversals', result.error)
  return result.rows.map(toReversalStamp)
}

/**
 * Reviews of the window's grants. A review is always written after the grant
 * it is about, so every relevant review was created on or after the window's
 * start (less a day of slack for a register clock running fast) — one
 * indexed read on (tenant_id, created_at) instead of an IN list.
 */
async function loadReviews(db: Db, tenantId: string, period: ReportPeriod, claimIds: ReadonlySet<string>): Promise<LedgerReview[]> {
  if (claimIds.size === 0) return []
  const sinceIso = new Date(Date.parse(period.startIso) - REVIEW_CLOCK_SLACK_MS).toISOString()
  const result = await readPagesConcurrently<Row>(
    (from, to) =>
      db
        .from('gov_discount_reviews')
        .select(REVIEW_COLUMNS)
        .eq('tenant_id', tenantId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .range(from, to)
        .then(asPage),
    { pageSize: PAGE_SIZE, maxRows: MAX_REVIEW_ROWS, concurrency: CONCURRENCY },
  )
  if (result.error) fail('reviews', result.error)
  return mapRows(result.rows, toLedgerReview).filter((review) => claimIds.has(review.claimId))
}

async function loadOutlets(db: Db, tenantId: string): Promise<OutletName[]> {
  const { data, error } = await db
    .from('outlets')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .limit(500)
  if (error) fail('outlets', error.message)
  return ((data ?? []) as Row[]).map((row) => ({ id: String(row.id), name: String(row.name ?? 'Branch') }))
}

async function hasAnyClaim(db: Db, tenantId: string): Promise<boolean> {
  const { data, error } = await db.from('gov_discount_claims').select('id').eq('tenant_id', tenantId).limit(1)
  if (error) fail('any claim', error.message)
  return (data ?? []).length > 0
}

export async function loadLedgerPageData(
  db: Db,
  tenantId: string,
  period: ReportPeriod,
  nowMs: number,
): Promise<LedgerPageData> {
  const [window, laterReversals, outlets] = await Promise.all([
    loadLedgerWindow(db, tenantId, period),
    loadLaterReversals(db, tenantId, period, nowMs),
    loadOutlets(db, tenantId),
  ])
  const grantIds = new Set(window.rows.filter((row) => row.event === 'granted').map((row) => row.id))
  const [reviews, hasAnyClaims] = await Promise.all([
    loadReviews(db, tenantId, period, grantIds),
    window.rows.length > 0 ? Promise.resolve(true) : hasAnyClaim(db, tenantId),
  ])
  return { ...window, laterReversals, reviews, outlets, hasAnyClaims }
}
