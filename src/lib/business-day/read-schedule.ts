/**
 * A store's business-day cutoff schedule (`business_day_cutoffs`), read through
 * the CALLER's session client. Every member of the store may read it (RLS); it
 * holds only times of day, so there is no reason to reach for the service role.
 *
 * Two entry points, because the two kinds of caller need opposite failures:
 *
 * - `readCutoffSchedule` is for WRITERS and FREEZERS (day close, cash screens,
 *   anything that files money under a day). It throws when the schedule cannot
 *   be read: filing a 1 AM sale under the wrong day and freezing it is worse
 *   than asking the person to try again.
 * - `readCutoffScheduleForDisplay` is for read-only screens (Reports, the
 *   dashboard). It falls back to Manila midnight and returns `isFallback: true`
 *   so the screen can say "Showing midnight-to-midnight; couldn't load your
 *   business day setting." A report should still open.
 *
 * A table that does not exist yet (the migration not applied on this database)
 * is NOT a failure: no store can have set a cutoff, so midnight is the truth,
 * the same rule as an absent ledger function (memory: order-ledger-absent).
 *
 * `business_day_cutoffs` is not in the generated types yet; the row is typed
 * here and the client is narrowed ONCE.
 */
import { MIDNIGHT_SCHEDULE, parseCutoffSchedule, type CutoffSchedule } from '@/lib/business-day/trading-day'

/** A store changes its cutoff a handful of times in its life; this many rows is a bug. */
export const CUTOFF_ROW_LIMIT = 500

export interface CutoffScheduleRead {
  schedule: CutoffSchedule
  /** True when the read failed and the schedule is the midnight stand-in. */
  isFallback: boolean
}

interface CutoffRow {
  effective_from: string
  cutoff_minutes: number
}

interface CutoffAnswer {
  data: CutoffRow[] | null
  error: { code?: string; message: string } | null
}

/** The slice of a PostgREST builder this reader uses. */
interface CutoffQuery {
  select(columns: string): CutoffQuery
  eq(column: string, value: string): CutoffQuery
  order(column: string, options: { ascending: boolean }): CutoffQuery
  limit(count: number): PromiseLike<CutoffAnswer>
}

interface CutoffDb {
  from(table: 'business_day_cutoffs'): CutoffQuery
}

/** Any Supabase client (typed or not); narrowed once below. */
export interface SessionClient {
  from: (...args: never[]) => unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** PostgREST "no such table in the schema cache" and Postgres "undefined_table". */
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01'])
const READ_FAILED = "Couldn't load the store's business day setting"

export async function readCutoffSchedule(client: SessionClient, tenantId: string): Promise<CutoffSchedule> {
  if (!UUID_PATTERN.test(tenantId)) throw new Error('A business day schedule needs a store id')
  const db = client as unknown as CutoffDb
  let answer: CutoffAnswer
  try {
    answer = await db
      .from('business_day_cutoffs')
      .select('effective_from, cutoff_minutes')
      .eq('tenant_id', tenantId)
      .order('effective_from', { ascending: true })
      .limit(CUTOFF_ROW_LIMIT)
  } catch (cause) {
    throw new Error(`${READ_FAILED}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (answer.error) {
    if (answer.error.code && MISSING_TABLE_CODES.has(answer.error.code)) return MIDNIGHT_SCHEDULE
    throw new Error(`${READ_FAILED}: ${answer.error.message}`)
  }
  return parseCutoffSchedule(answer.data ?? [])
}

export async function readCutoffScheduleForDisplay(client: SessionClient, tenantId: string): Promise<CutoffScheduleRead> {
  try {
    return { schedule: await readCutoffSchedule(client, tenantId), isFallback: false }
  } catch (error) {
    console.error('[Business day] showing midnight-to-midnight instead:', { tenantId, error })
    return { schedule: MIDNIGHT_SCHEDULE, isFallback: true }
  }
}
