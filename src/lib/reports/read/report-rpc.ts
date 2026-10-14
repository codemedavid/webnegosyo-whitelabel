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
import type { ReportBranchArgs } from './report-scope'

interface RpcError {
  code?: string
  message: string
}

/** A report function that exists in the generated schema: a renamed function fails the build, not a page. */
type ReportFunction = Extract<keyof Database['public']['Functions'], `report_${string}`>

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
): Promise<ReportResult<T>> {
  let reply: { data: unknown; error: RpcError | null }
  try {
    reply = await client.rpc(fn, args)
  } catch (error) {
    return failure(fn, 'failed', error instanceof Error ? error.message : String(error))
  }
  if (reply.error) {
    const { code, message } = reply.error
    if (code === INSUFFICIENT_PRIVILEGE) return failure(fn, 'forbidden', message, REPORT_FORBIDDEN_MESSAGE)
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
