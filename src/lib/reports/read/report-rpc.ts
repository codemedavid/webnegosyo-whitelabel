/**
 * The platform report functions (supabase/migrations/20261014110000…), called
 * through the caller's OWN session client so RLS and the `reports` key apply.
 * Never pass a service-role client here (plan §8.4).
 *
 * Every read returns a result instead of throwing, so one failing card never
 * takes the page down (plan §4 "Errors are scoped to one card").
 *
 * A window longer than one call allows (93 days) is read one business month
 * at a time and merged (`report-chunks.ts`, `merge-report-rows.ts`); one
 * failed month fails the read, never a partial year. Finished months may be
 * cached per CALLER (`window.cache`): the key carries the caller, the
 * function, the store, the branch and the exact window, so a cached month is
 * only ever handed back to the account whose session produced it.
 */

import type { Database } from '@/types/supabase'
import type { CutoffSchedule } from '@/lib/business-day/trading-day'
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
import { splitReportWindow, type ReportChunk } from './report-chunks'
import {
  mergeBreakdownRows,
  mergeExpenseCategories,
  mergeHourCells,
  mergePaymentBuckets,
  mergePeriodRows,
  mergeProfitFigures,
  mergeProfitPeriods,
  mergeSalesTotals,
} from './merge-report-rows'

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

/** Where finished months are kept between requests. Failures are ignored (a miss). */
export interface ReportChunkCache {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown, ttlSeconds: number) => Promise<void>
}

export interface ReportWindow {
  tenantId: string
  /** Half-open [start, end), epoch ms. */
  start: number
  end: number
  branch: ReportBranchArgs
  /** When the window was resolved; decides which months are finished. Default: the clock. */
  now?: number
  /** The store's business-day cutoffs, so months are cut where its days are. */
  schedule?: CutoffSchedule
  /** Cache finished months of a long window for this caller (`scope` = the user id). */
  cache?: { store: ReportChunkCache; scope: string }
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

/** A finished month changes only when an old order is edited; an hour is the longest it may lag. */
const CLOSED_CHUNK_TTL_SECONDS = 60 * 60
/** Months read at once: a year is twelve calls, and every store shares one database. */
const CHUNK_CONCURRENCY = 3
/** Bump when a report function's output changes, so no cached month outlives it. */
const CHUNK_CACHE_VERSION = 'v1'

export type ReportDimension = 'source' | 'order_type' | 'outlet'

function baseArgs(window: Pick<ReportWindow, 'tenantId' | 'start' | 'end' | 'branch'>): Record<string, unknown> {
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

type ChunkMerge<T> = (parts: T[]) => T

/** Runs `task` over `items`, at most `limit` at a time, keeping their order. */
async function mapLimit<In, Out>(items: readonly In[], limit: number, task: (item: In) => Promise<Out>): Promise<Out[]> {
  const results: Out[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function chunkCacheKey(fn: ReportFunction, scope: string, args: Record<string, unknown>): string {
  const argPart = Object.keys(args)
    .sort()
    .map((key) => `${key}=${String(args[key])}`)
    .join('&')
  return `reports:${CHUNK_CACHE_VERSION}:${scope}:${fn}:${argPart}`
}

async function cachedGet(cache: ReportChunkCache, key: string): Promise<unknown> {
  try {
    return await cache.get(key)
  } catch {
    return null
  }
}

async function cachedSet(cache: ReportChunkCache, key: string, value: unknown): Promise<void> {
  try {
    await cache.set(key, value, CLOSED_CHUNK_TTL_SECONDS)
  } catch {
    // A cache that cannot write is only slower.
  }
}

async function readChunk<T>(
  client: ReportRpcClient,
  fn: ReportFunction,
  window: ReportWindow,
  chunk: ReportChunk,
  extraArgs: Record<string, unknown>,
  map: (rows: unknown) => T,
  forbiddenMessage: string,
): Promise<ReportResult<T>> {
  const args = { ...baseArgs({ ...window, start: chunk.start, end: chunk.end }), ...extraArgs }
  const cache = chunk.isClosed ? window.cache : undefined
  const key = cache ? chunkCacheKey(fn, cache.scope, args) : null
  if (cache && key) {
    const hit = await cachedGet(cache.store, key)
    if (hit !== null && hit !== undefined) return { ok: true, data: hit as T }
  }
  const result = await callReport(client, fn, args, map, forbiddenMessage)
  if (result.ok && cache && key) await cachedSet(cache.store, key, result.data)
  return result
}

/**
 * One call when the window fits; otherwise one per business month, merged
 * oldest first. The first failure (in month order) is the read's result.
 */
async function readWindow<T>(
  client: ReportRpcClient,
  fn: ReportFunction,
  window: ReportWindow,
  extraArgs: Record<string, unknown>,
  map: (rows: unknown) => T,
  merge: ChunkMerge<T>,
  forbiddenMessage = REPORT_FORBIDDEN_MESSAGE,
): Promise<ReportResult<T>> {
  const chunks = splitReportWindow(window.start, window.end, { now: window.now ?? Date.now(), schedule: window.schedule })
  if (chunks.length <= 1) return callReport(client, fn, { ...baseArgs(window), ...extraArgs }, map, forbiddenMessage)

  const results = await mapLimit(chunks, CHUNK_CONCURRENCY, (chunk) =>
    readChunk(client, fn, window, chunk, extraArgs, map, forbiddenMessage),
  )
  const failed = results.find((result): result is { ok: false; error: ReportFailure } => !result.ok)
  if (failed) return failed
  return { ok: true, data: merge(results.map((result) => (result as { ok: true; data: T }).data)) }
}

export function readTotals(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<SalesTotals>> {
  return readWindow(client, 'report_sales_summary', window, {}, toSalesTotals, mergeSalesTotals)
}

export function readPeriods(client: ReportRpcClient, window: ReportWindow, grain: ReportGrain): Promise<ReportResult<PeriodRow[]>> {
  return readWindow(client, 'report_sales_by_period', window, { p_grain: grain }, toPeriodRows, mergePeriodRows)
}

export function readDimension(
  client: ReportRpcClient,
  window: ReportWindow,
  dimension: ReportDimension,
  mapping: DimensionMapping,
): Promise<ReportResult<BreakdownRow[]>> {
  return readWindow(
    client,
    'report_sales_by_dimension',
    window,
    { p_dimension: dimension },
    (rows) => toDimensionRows(rows, mapping),
    mergeBreakdownRows,
  )
}

export function readHours(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<HourCell[]>> {
  return readWindow(client, 'report_sales_by_hour', window, {}, toHourCells, mergeHourCells)
}

export function readItems(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<ItemRow[]>> {
  return readWindow(client, 'report_sales_by_item', window, {}, toItemRows, mergeBreakdownRows)
}

export function readCategories(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<CategoryReportRow[]>> {
  return readWindow(client, 'report_sales_by_category', window, {}, toCategoryRows, (parts) =>
    mergeBreakdownRows(parts).map((row) => ({
      ...row,
      // Filed by today's menu in ANY month = filed by today's menu.
      isFromCurrentMenu: parts.some((part) => part.some((other) => other.key === row.key && other.isFromCurrentMenu)),
    })),
  )
}

export function readPayments(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<PaymentBucket[]>> {
  return readWindow(client, 'report_payments', window, {}, toPaymentBuckets, mergePaymentBuckets)
}

export function readProfitSummary(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<ProfitFigures>> {
  return readWindow(client, 'report_profit_summary', window, {}, toProfitFigures, mergeProfitFigures, PROFIT_FORBIDDEN_MESSAGE)
}

export function readProfitPeriods(
  client: ReportRpcClient,
  window: ReportWindow,
  grain: ProfitGrain,
): Promise<ReportResult<ProfitPeriodFigures[]>> {
  return readWindow(
    client,
    'report_profit_by_period',
    window,
    { p_grain: grain },
    toProfitPeriods,
    mergeProfitPeriods,
    PROFIT_FORBIDDEN_MESSAGE,
  )
}

export function readExpenseCategories(client: ReportRpcClient, window: ReportWindow): Promise<ReportResult<ExpenseCategoryTotal[]>> {
  return readWindow(
    client,
    'report_expenses_by_category',
    window,
    {},
    toExpenseCategoryTotals,
    mergeExpenseCategories,
    PROFIT_FORBIDDEN_MESSAGE,
  )
}
