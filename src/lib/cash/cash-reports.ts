/**
 * Cash reports (CONTRACTS W3.1 `20261027200000_report_cash_functions.sql`):
 * `report_cash_summary` (one row per shift, first vs final count) and
 * `report_cash_by_staff` (per cashier: shifts, short/over, forced closes,
 * recounts that changed). INVOKER + `cash_manage` (42501), ≤ 93 days, read
 * through the caller's session.
 *
 * Over/short is phrased as a PATTERN, never a verdict (06 §4.5): "Short 3
 * times in 14 shifts · −₱260 in all", not "Ana is a thief".
 */

import { z } from 'zod'
import { callCashRpc, cashFailure, type CashResult, type CashRpcClient } from './cash-rpc'

const cents = z.union([z.number().int(), z.string().regex(/^-?\d+$/).transform(Number)])
const maybeCents = cents.nullable().catch(null).default(null)
const whole = z.union([z.number().int(), z.string().regex(/^\d+$/).transform(Number)]).catch(0).default(0)
const text = z.string().nullable().catch(null).default(null)

function pick(data: unknown, fields: ReadonlyArray<readonly [string, string]>): Record<string, unknown> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected an object.')
  const source = data as Record<string, unknown>
  return Object.fromEntries(fields.map(([key, column]) => [key, column in source ? source[column] : source[key]]))
}

function rowsOf(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)) return (data as { rows: unknown[] }).rows
  if (data === null || data === undefined) return []
  throw new Error('Expected a list of rows.')
}

// ── One row per shift ──────────────────────────────────────────────────────

const SUMMARY_FIELDS = [
  ['shiftId', 'shift_id'],
  ['businessDay', 'business_day'],
  ['outletId', 'outlet_id'],
  ['staffUserId', 'staff_user_id'],
  ['staffName', 'staff_name'],
  ['drawerName', 'drawer_name'],
  ['openedAt', 'opened_at'],
  ['closedAt', 'closed_at'],
  ['closeKind', 'close_kind'],
  ['expectedCents', 'expected_cents'],
  ['firstCountCents', 'first_count_cents'],
  ['finalCountCents', 'final_count_cents'],
  ['differenceCents', 'difference_cents'],
  ['remittanceStatus', 'remittance_status'],
] as const

const summarySchema = z.object({
  shiftId: z.string().min(1),
  businessDay: z.string(),
  outletId: text,
  staffUserId: text,
  staffName: z.string().nullable().catch(null).default(null).transform((name) => name?.trim() || 'Staff'),
  drawerName: text,
  openedAt: z.string(),
  closedAt: text,
  closeKind: text,
  expectedCents: maybeCents,
  firstCountCents: maybeCents,
  finalCountCents: maybeCents,
  /** final count − expected; null = no count (open, forced, or no expected figure). */
  differenceCents: maybeCents,
  remittanceStatus: text,
})

export type CashShiftReportRow = z.infer<typeof summarySchema>

export function parseCashSummary(data: unknown): CashShiftReportRow[] {
  return rowsOf(data).map((row) => summarySchema.parse(pick(row, SUMMARY_FIELDS)))
}

// ── Per cashier ────────────────────────────────────────────────────────────

const STAFF_FIELDS = [
  ['staffUserId', 'staff_user_id'],
  ['staffName', 'staff_name'],
  ['shifts', 'shifts'],
  ['shortCount', 'short_count'],
  ['overCount', 'over_count'],
  ['overShortCents', 'over_short_cents'],
  ['forcedCloses', 'forced_closes'],
  ['recountChanged', 'recount_changed'],
] as const

const staffSchema = z.object({
  staffUserId: text,
  staffName: z.string().nullable().catch(null).default(null).transform((name) => name?.trim() || 'Staff'),
  shifts: whole,
  shortCount: whole,
  overCount: whole,
  /** Net over (+) / short (−) across the counted shifts; null = nothing counted. */
  overShortCents: maybeCents,
  forcedCloses: whole,
  recountChanged: whole,
})

export type CashierReportRow = z.infer<typeof staffSchema>

export function parseCashByStaff(data: unknown): CashierReportRow[] {
  return rowsOf(data).map((row) => staffSchema.parse(pick(row, STAFF_FIELDS)))
}

// ── Calls ──────────────────────────────────────────────────────────────────

export interface CashReportRange {
  tenantId: string
  fromDay: string
  toDay: string
  /** null = every branch the caller reaches. */
  outletId: string | null
}

export const CASH_REPORT_FORBIDDEN = 'Only the owner or someone who handles cash can see cashier short & over.'
const CASH_REPORT_FAILED = 'Cashier short & over couldn’t load. Try again in a moment.'
const MAX_DAYS = 93
const DAY = /^\d{4}-\d{2}-\d{2}$/

function rangeArgs(range: CashReportRange): Record<string, unknown> | null {
  if (!DAY.test(range.fromDay) || !DAY.test(range.toDay)) return null
  const days = (Date.parse(`${range.toDay}T00:00:00Z`) - Date.parse(`${range.fromDay}T00:00:00Z`)) / 86_400_000 + 1
  if (!(days >= 1 && days <= MAX_DAYS)) return null
  return { p_tenant: range.tenantId, p_from_day: range.fromDay, p_to_day: range.toDay, p_outlet: range.outletId }
}

const OPTIONS = { forbiddenMessage: CASH_REPORT_FORBIDDEN, failedMessage: CASH_REPORT_FAILED, invalidMessage: `Pick up to ${MAX_DAYS} days.` }

export function readCashSummary(client: CashRpcClient, range: CashReportRange): Promise<CashResult<CashShiftReportRow[]>> {
  const args = rangeArgs(range)
  if (!args) return Promise.resolve(cashFailure('invalid', OPTIONS.invalidMessage))
  return callCashRpc(client, 'report_cash_summary', args, parseCashSummary, OPTIONS)
}

export function readCashByStaff(client: CashRpcClient, range: CashReportRange): Promise<CashResult<CashierReportRow[]>> {
  const args = rangeArgs(range)
  if (!args) return Promise.resolve(cashFailure('invalid', OPTIONS.invalidMessage))
  return callCashRpc(client, 'report_cash_by_staff', args, parseCashByStaff, OPTIONS)
}
