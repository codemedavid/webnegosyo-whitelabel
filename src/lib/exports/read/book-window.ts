/**
 * What every book reader of an export shares: the window it reads (the
 * caller's session client, dates, branch, staff keys), the shape it answers
 * in, and the small cell helpers.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CutoffSchedule } from '@/lib/business-day/trading-day'
import type { ReportRpcClient, ReportWindow } from '@/lib/reports/read/report-rpc'
import type { ReportBranchArgs } from '@/lib/reports/read/report-scope'
import { ExportError } from '../errors'
import type { ExportAccess, ExportRow } from '../types'

/** Rows one book sheet may list. Over it the export is refused, never cut short. */
export const MAX_BOOK_ROWS = 20_000

export interface BookWindow {
  tenantId: string
  /** Business days, inclusive. */
  fromDay: string
  toDay: string
  /** Half-open [start, end), epoch ms. */
  start: number
  end: number
  branch: ReportBranchArgs
  outletNames: ReadonlyMap<string, string>
  access: ExportAccess
  /** The caller's session client. */
  client: SupabaseClient
  /** The report engine's client (caller's session), for the profit functions. */
  reportClient: ReportRpcClient
  reportWindow: ReportWindow
  /** When each of the store's days starts (midnight unless the store closes later). */
  schedule: CutoffSchedule
  /** Preview: read only the first rows of a long book. */
  peek: number | null
  pageSize?: number
}

export interface BookSheetRows {
  rows: ExportRow[]
  /** The whole book's row count when only its first rows were read; else rows.length. */
  total: number | null
  notes: string[]
}

export function branchName(outletId: string | null, names: ReadonlyMap<string, string>): string | null {
  return outletId ? (names.get(outletId) ?? 'Unknown branch') : null
}

export function inBranch(outletId: string | null, branch: ReportBranchArgs): boolean {
  if (branch.p_unassigned) return outletId === null
  return branch.p_outlet === null || outletId === branch.p_outlet
}

export function tooMany(what: string): ExportError {
  return new ExportError(`There are more than ${MAX_BOOK_ROWS.toLocaleString('en-PH')} ${what} in these dates. Pick a shorter range.`, 400)
}

export const iso = (ms: number): string => new Date(ms).toISOString()
export const round2 = (value: number): number => Math.round(value * 100) / 100
export const num = (value: unknown): number | null => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value))

export async function countOf(what: string, query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await query
  if (error || count === null) throw new ExportError(`The ${what} could not be counted. Try again in a moment.`, 502)
  if (count > MAX_BOOK_ROWS) throw tooMany(what)
  return count
}
