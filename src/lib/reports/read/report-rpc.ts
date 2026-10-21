/**
 * The platform report functions (supabase/migrations/20261014110000…), called
 * through the caller's OWN session client so RLS and the `reports` key apply.
 * Never pass a service-role client here (plan §8.4).
 *
 * Every read returns a result instead of throwing, so one failing card never
 * takes the page down (plan §4 "Errors are scoped to one card").
 */

import type { Database } from '@/types/supabase'
import type { ReportGrain } from '../period'
import type { PaymentBucket } from '../payment-buckets'
import type { ExpenseCategoryTotal, ProfitFigures, ProfitGrain, ProfitPeriodFigures } from '../profit-facts'
import type { BreakdownRow, HourCell, ItemRow, PeriodRow } from '../sales-breakdowns'
import {
  toCategoryRows,
  toDimensionRows,
  toHourCells,
  toItemRows,
  toPaymentBuckets,
  toPeriodRows,
  toSalesTotals,
  type CategoryReportRow,
  type DimensionMapping,
  type SalesTotals,
} from './report-rpc-rows'
import { toExpenseCategoryTotals, toProfitFigures, toProfitPeriods } from './report-profit-rows'
import type { ReportBranchArgs } from './report-scope'

interface RpcError {
  code?: string
  message: string
}

/**
 * The profit functions (20261022120300_report_profit.sql). Listed by name until
 * the generated schema is regenerated after the migration is applied; then
 * they are in the Extract below too and this list can go.
 */
type ProfitReportFunction = 'report_profit_summary' | 'report_profit_by_period' | 'report_expenses_by_category'

/** A report function that exists in the generated schema: a renamed function fails the build, not a page. */
type ReportFunction = Extract<keyof Database['public']['Functions'], `report_${string}`> | ProfitReportFunction

/** The one method of the Supabase client these reads use. */
export interface ReportRpcClient {
  rpc: (fn: ReportFunction, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError | null }>
}

/** Narrow a generated Supabase client to the subset these reads use. */
export function asReportRpcClient(client: unknown): ReportRpcClient {
  return client as ReportRpcClient
}

export interface ReportWindow {
  tenantId: string
  /** Half-open [start, end), epoch ms. */
  start: number
  end: number
  branch: ReportBranchArgs
}

export type ReportFailureKind = 'forbidden' | 'invalid' | 'failed'

export interface ReportFailure {
  kind: ReportFailureKind
  /** Safe to show staff. */
  message: string
}

export type ReportResult<T> = { ok: true; data: T } | { ok: false; error: ReportFailure }

export const REPORT_FORBIDDEN_MESSAGE = 'You need the Reports permission to see this. Ask the store owner.'
/** Profit also needs the Expenses and Costs keys (reporting.assert_profit_access). */
export const PROFIT_FORBIDDEN_MESSAGE = 'Ask the owner for cost access to see profit.'
export const REPORT_FAILED_MESSAGE = 'This part of the report couldn’t load. Try again in a moment.'

const INSUFFICIENT_PRIVILEGE = '42501'
const INVALID_PARAMETER = '22023'

export type ReportDimension = 'source' | 'order_type' | 'outlet'

function baseArgs(window: ReportWindow): Record<string, unknown> {
  return {
    p_tenant: window.tenantId,
    p_from: new Date(window.start).toISOString(),
    p_to: new Date(window.end).toISOString(),
    // Defaults are left out, not sent as null: the functions' own defaults apply.
    ...(window.branch.p_outlet !== null ? { p_outlet: window.branch.p_outlet } : {}),
    ...(window.branch.p_unassigned ? { p_unassigned: true } : {}),
  }
}

function failure(fn: ReportFunction, kind: ReportFailureKind, detail: string, message = REPORT_FAILED_MESSAGE): ReportResult<never> {
  if (kind === 'failed') console.error(`[reports] ${fn} failed`, detail)
  return { ok: false, error: { kind, message } }
}

async function callReport<T>(
  client: ReportRpcClient,
  fn: ReportFunction,
  args: Record<string, unknown>,
  map: (rows: unknown) => T,
  forbiddenMessage = REPORT_FORBIDDEN_MESSAGE,
): Promise<ReportResult<T>> {
  let reply: { data: unknown; error: RpcError | null }
  try {
    reply = await client.rpc(fn, args)
  } catch (error) {
    return failure(fn, 'failed', error instanceof Error ? error.message : String(error))
  }
  if (reply.error) {
    const { code, message } = reply.error
    if (code === INSUFFICIENT_PRIVILEGE) return failure(fn, 'forbidden', message, forbiddenMessage)
    // The functions' own range sentences are written for staff.
    if (code === INVALID_PARAMETER) return failure(fn, 'invalid', message, message)
    return failure(fn, 'failed', `${code ?? 'no code'}: ${message}`)
  }
  try {
    return { ok: true, data: map(reply.data) }
  } catch (error) {
    return failure(fn, 'failed', error instanceof Error ? error.message : String(error))
  }
}

export function readTotals(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<SalesTotals>> {
  return callReport(client, 'report_sales_summary', baseArgs(window), toSalesTotals)
}

export function readPeriods(client: ReportRpcClient, window: ReportWindow, grain: ReportGrain): Promise<ReportResult<PeriodRow[]>> {
  return callReport(client, 'report_sales_by_period', { ...baseArgs(window), p_grain: grain }, toPeriodRows)
}

export function readDimension(
  client: ReportRpcClient,
  window: ReportWindow,
  dimension: ReportDimension,
  mapping: DimensionMapping,
): Promise<ReportResult<BreakdownRow[]>> {
  return callReport(client, 'report_sales_by_dimension', { ...baseArgs(window), p_dimension: dimension }, (rows) =>
    toDimensionRows(rows, mapping),
  )
}

export function readHours(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<HourCell[]>> {
  return callReport(client, 'report_sales_by_hour', baseArgs(window), toHourCells)
}

export function readItems(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<ItemRow[]>> {
  return callReport(client, 'report_sales_by_item', baseArgs(window), toItemRows)
}

export function readCategories(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<CategoryReportRow[]>> {
  return callReport(client, 'report_sales_by_category', baseArgs(window), toCategoryRows)
}

export function readPayments(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<PaymentBucket[]>> {
  return callReport(client, 'report_payments', baseArgs(window), toPaymentBuckets)
}

export function readProfitSummary(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<ProfitFigures>> {
  return callReport(client, 'report_profit_summary', baseArgs(window), toProfitFigures, PROFIT_FORBIDDEN_MESSAGE)
}

export function readProfitPeriods(
  client: ReportRpcClient,
  window: ReportWindow,
  grain: ProfitGrain,
): Promise<ReportResult<ProfitPeriodFigures[]>> {
  return callReport(client, 'report_profit_by_period', { ...baseArgs(window), p_grain: grain }, toProfitPeriods, PROFIT_FORBIDDEN_MESSAGE)
}

export function readExpenseCategories(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<ExpenseCategoryTotal[]>> {
  return callReport(client, 'report_expenses_by_category', baseArgs(window), toExpenseCategoryTotals, PROFIT_FORBIDDEN_MESSAGE)
}
