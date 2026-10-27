/**
 * The business-day close (CONTRACTS W3.1, 07 §5.2–5.3): a versioned record
 * with a FROZEN snapshot of the day — sales from the one sales definition,
 * every drawer, the cash to account for, by named shift — plus a set-once
 * deposit and an owner-only reopen.
 *
 * Everything goes through the caller's session client. The RPCs are the
 * state machine (`close_business_day`, `reopen_business_day`,
 * `record_day_deposit`); reads are `get_day_close_status`,
 * `get_business_day_close` and the `business_day_closes` table under RLS
 * (cash managers, branch reach). Parsers accept the table's snake_case and
 * the RPCs' camelCase alike, and keep unknown money as null — never ₱0.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { INSUFFICIENT_PRIVILEGE, INVALID_PARAMETER, cashFailure, type CashDbError, type CashResult, type CashRpcClient } from './cash-rpc'

// ── Snapshot ────────────────────────────────────────────────────────────────

const cents = z.union([z.number().int(), z.string().regex(/^-?\d+$/).transform(Number)])
const maybeCents = cents.nullable().catch(null).default(null)
const count = z.number().int().nonnegative().catch(0).default(0)
const maybeText = z.string().nullable().catch(null).default(null)

const snapshotShiftSchema = z.object({
  shiftId: z.string(),
  staff: z.string().catch('Staff').default('Staff'),
  drawer: maybeText,
  closeKind: maybeText,
  floatCents: maybeCents,
  cashSalesCents: maybeCents,
  payInCents: maybeCents,
  payOutCents: maybeCents,
  collectedCents: maybeCents,
  expectedCents: maybeCents,
  expectedSource: maybeText,
  countedCents: maybeCents,
  varianceCents: maybeCents,
  remittance: z
    .object({ status: z.string(), handedOverCents: maybeCents, receivedCents: maybeCents })
    .nullable()
    .catch(null)
    .default(null),
})

const snapshotSchema = z.object({
  window: z.object({ start: z.string(), end: z.string(), cutoffMinutes: z.number().int().catch(0).default(0) }).nullable().catch(null).default(null),
  /** null = masked (a caller without `reports`) or a store whose sales are not on the platform database. */
  sales: z
    .object({
      netCents: cents,
      orders: count,
      discountCents: maybeCents,
      collectedByMethod: z.array(z.object({ bucket: z.string(), cents })).catch([]).default([]),
      unpaidCents: maybeCents,
      overpaidCents: maybeCents,
    })
    .nullable()
    .catch(null)
    .default(null),
  drawers: z
    .object({
      shifts: z.array(snapshotShiftSchema).catch([]).default([]),
      totals: z
        .object({
          expectedCents: maybeCents,
          countedCents: maybeCents,
          varianceCents: maybeCents,
          handedOverCents: maybeCents,
          receivedCents: maybeCents,
          collectedMidShiftCents: maybeCents,
        })
        .catch({ expectedCents: null, countedCents: null, varianceCents: null, handedOverCents: null, receivedCents: null, collectedMidShiftCents: null }),
    })
    .catch({ shifts: [], totals: { expectedCents: null, countedCents: null, varianceCents: null, handedOverCents: null, receivedCents: null, collectedMidShiftCents: null } }),
  cashToAccountForCents: maybeCents,
  expenses: z.object({ drawerCents: maybeCents, otherCents: maybeCents }).nullable().catch(null).default(null),
  lateSales: z.object({ count, cashCents: maybeCents }).nullable().catch(null).default(null),
  unattributedCounterCashCents: maybeCents,
  byServicePeriod: z
    .array(z.object({ periodId: z.string().nullable().catch(null), name: z.string(), netCents: cents, orders: count }))
    .catch([])
    .default([]),
  otherHoursNetCents: maybeCents,
  recountChanged: z
    .array(z.object({ shiftId: z.string(), staffName: z.string().catch('Staff'), firstCents: cents, finalCents: cents }))
    .catch([])
    .default([]),
})

export type DayCloseSnapshot = z.infer<typeof snapshotSchema>
export type DayCloseSnapshotShift = z.infer<typeof snapshotShiftSchema>

export function parseDayCloseSnapshot(data: unknown): DayCloseSnapshot {
  return snapshotSchema.parse(data ?? {})
}

// ── The close record ────────────────────────────────────────────────────────

export interface DayClose {
  id: string
  tenantId: string
  outletId: string | null
  businessDay: string
  version: number
  status: 'closed' | 'reopened'
  windowStart: string
  windowEnd: string
  snapshot: DayCloseSnapshot
  salesSource: 'platform_sql' | 'drawers_only'
  forcedShiftIds: string[]
  unsettledRemittanceIds: string[]
  note: string | null
  closedByName: string
  closedAt: string
  depositCents: number | null
  depositTo: string | null
  depositRef: string | null
  depositProofUrl: string | null
  depositRecordedAt: string | null
  reopenedByName: string | null
  reopenedAt: string | null
  reopenReason: string | null
}

const FIELDS: ReadonlyArray<readonly [keyof DayClose, string]> = [
  ['id', 'id'],
  ['tenantId', 'tenant_id'],
  ['outletId', 'outlet_id'],
  ['businessDay', 'business_day'],
  ['version', 'version'],
  ['status', 'status'],
  ['windowStart', 'window_start'],
  ['windowEnd', 'window_end'],
  ['snapshot', 'snapshot'],
  ['salesSource', 'sales_source'],
  ['forcedShiftIds', 'forced_shift_ids'],
  ['unsettledRemittanceIds', 'unsettled_remittance_ids'],
  ['note', 'note'],
  ['closedByName', 'closed_by_name'],
  ['closedAt', 'closed_at'],
  ['depositCents', 'deposit_cents'],
  ['depositTo', 'deposit_to'],
  ['depositRef', 'deposit_ref'],
  ['depositProofUrl', 'deposit_proof_url'],
  ['depositRecordedAt', 'deposit_recorded_at'],
  ['reopenedByName', 'reopened_by_name'],
  ['reopenedAt', 'reopened_at'],
  ['reopenReason', 'reopen_reason'],
]

const nullableText = z.string().nullable().default(null)

const closeSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  outletId: nullableText,
  businessDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  version: z.number().int().min(1),
  status: z.enum(['closed', 'reopened']),
  windowStart: z.string(),
  windowEnd: z.string(),
  snapshot: z.unknown().transform(parseDayCloseSnapshot),
  salesSource: z.enum(['platform_sql', 'drawers_only']).catch('drawers_only'),
  forcedShiftIds: z.array(z.string()).nullable().default([]).transform((ids) => ids ?? []),
  unsettledRemittanceIds: z.array(z.string()).nullable().default([]).transform((ids) => ids ?? []),
  note: nullableText,
  closedByName: z.string().nullable().default(null).transform((name) => name?.trim() || 'Staff'),
  closedAt: z.string(),
  depositCents: cents.nullable().default(null),
  depositTo: nullableText,
  depositRef: nullableText,
  depositProofUrl: nullableText,
  depositRecordedAt: nullableText,
  reopenedByName: nullableText,
  reopenedAt: nullableText,
  reopenReason: nullableText,
})

function pick(data: unknown, fields: ReadonlyArray<readonly [string, string]>): Record<string, unknown> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected an object.')
  const source = data as Record<string, unknown>
  return Object.fromEntries(fields.map(([key, column]) => [key, column in source ? source[column] : source[key]]))
}

export function parseDayClose(data: unknown): DayClose {
  return closeSchema.parse(pick(Array.isArray(data) ? data[0] : data, FIELDS))
}

/** What the deposit is compared with: cash to account for minus what went in the bank (null until both are known). */
export function depositDifferenceCents(close: Pick<DayClose, 'depositCents' | 'snapshot'>): number | null {
  const expected = close.snapshot.cashToAccountForCents
  if (close.depositCents === null || expected === null) return null
  return close.depositCents - expected
}

// ── The checklist ───────────────────────────────────────────────────────────

const statusSchema = z.object({
  businessDay: z.string(),
  window: z.object({ start: z.string(), end: z.string() }),
  cutoffMinutes: z.number().int().catch(0).default(0),
  openShifts: z
    .array(z.object({ shiftId: z.string(), staffName: z.string().catch('Staff'), drawerName: maybeText, openedAt: z.string(), overdue: z.boolean().catch(false) }))
    .catch([])
    .default([]),
  pendingRemittances: z
    .array(z.object({ id: z.string(), cashierName: z.string().catch('Staff'), handedOverCents: maybeCents, status: z.string() }))
    .catch([])
    .default([]),
  nonCashUnchecked: z.array(z.object({ shiftId: z.string(), staffName: z.string().catch('Staff'), method: z.string() })).catch([]).default([]),
  existingClose: z
    .object({ id: z.string(), version: z.number().int(), status: z.string(), closedAt: z.string(), closedByName: z.string().nullable().catch(null) })
    .nullable()
    .catch(null)
    .default(null),
  preview: z.unknown().transform((value) => (value === null || value === undefined ? null : parseDayCloseSnapshot(value))),
})

export type DayCloseStatus = z.infer<typeof statusSchema>

export function parseDayCloseStatus(data: unknown): DayCloseStatus {
  return statusSchema.parse(data)
}

// ── Calls ───────────────────────────────────────────────────────────────────

export const DAY_CLOSE_NOTE_MAX = 500
export const REOPEN_REASON_MAX = 300
export const DEPOSIT_TEXT_MAX = 80
const MAX_DEPOSIT_CENTS = 10_000_000_000

export const DAY_CLOSE_COPY = {
  forbidden: 'Only the owner or someone who handles cash can close the day.',
  reopenForbidden: 'Only the owner can reopen a closed day, within 31 days.',
  openShifts: 'Someone is still on shift. End every shift first; a day can’t close with an open drawer.',
  unsettled: 'Some cash hasn’t been accepted yet. Accept it, or close anyway with a note.',
  alreadyClosed: 'This day is already closed. Reopen it to close it again.',
  depositTaken: 'A deposit is already recorded for this close.',
  noteRequired: 'Say why. It stays on the close.',
  failed: 'That didn’t save. Nothing changed. Try again in a moment.',
  loadFailed: 'The day close couldn’t load. Try again in a moment.',
} as const

export type DayCloseRefusal = 'forbidden' | 'open_shifts' | 'unsettled_remittances' | 'already_closed' | 'invalid' | 'failed'

export type DayCloseCallResult<T> = { ok: true; data: T } | { ok: false; reason: DayCloseRefusal; message: string }

const UUID = z.string().uuid()
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const OBJECT_NOT_IN_STATE = '55000'
const UNIQUE_VIOLATION = '23505'

function refused<T>(reason: DayCloseRefusal, message: string): DayCloseCallResult<T> {
  return { ok: false, reason, message }
}

function classify(fn: string, error: CashDbError, forbidden: string): DayCloseCallResult<never> {
  if (error.code === INSUFFICIENT_PRIVILEGE) return refused('forbidden', forbidden)
  if (error.code === OBJECT_NOT_IN_STATE && /unsettled_remittances/.test(error.message)) return refused('unsettled_remittances', DAY_CLOSE_COPY.unsettled)
  if (error.code === OBJECT_NOT_IN_STATE && /open_shifts/.test(error.message)) return refused('open_shifts', DAY_CLOSE_COPY.openShifts)
  if (error.code === UNIQUE_VIOLATION) return refused('already_closed', DAY_CLOSE_COPY.alreadyClosed)
  if (error.code === OBJECT_NOT_IN_STATE && /deposit/.test(error.message)) return refused('already_closed', DAY_CLOSE_COPY.depositTaken)
  if (error.code === INVALID_PARAMETER) return refused('invalid', DAY_CLOSE_COPY.noteRequired)
  console.error(`[cash] ${fn} failed`, `${error.code ?? 'no code'}: ${error.message}`)
  return refused('failed', DAY_CLOSE_COPY.failed)
}

async function call<T>(
  client: CashRpcClient,
  fn: string,
  args: Record<string, unknown>,
  parse: (data: unknown) => T,
  forbidden: string,
): Promise<DayCloseCallResult<T>> {
  try {
    const { data, error } = await client.rpc(fn, args)
    if (error) return classify(fn, error, forbidden)
    return { ok: true, data: parse(data) }
  } catch (error) {
    console.error(`[cash] ${fn} failed`, error instanceof Error ? error.message : error)
    return refused('failed', DAY_CLOSE_COPY.failed)
  }
}

function clean(text: string | null | undefined, max: number): string | null {
  const trimmed = text?.trim() ?? ''
  return trimmed === '' ? null : trimmed.slice(0, max)
}

interface DayRef {
  tenantId: string
  /** null = a store without branches (or the whole store). */
  outletId: string | null
  day: string
}

/** The checklist and a preview of the snapshot. Cash managers only. */
export async function getDayCloseStatus(client: CashRpcClient, ref: DayRef): Promise<CashResult<DayCloseStatus>> {
  if (!DAY.safeParse(ref.day).success) return cashFailure('invalid', 'That day can’t be read.')
  const result = await call(client, 'get_day_close_status', { p_tenant: ref.tenantId, p_outlet: ref.outletId, p_day: ref.day }, parseDayCloseStatus, DAY_CLOSE_COPY.forbidden)
  if (result.ok) return result
  return cashFailure(result.reason === 'forbidden' ? 'forbidden' : 'failed', result.reason === 'forbidden' ? result.message : DAY_CLOSE_COPY.loadFailed)
}

export interface CloseDayInput extends DayRef {
  note: string | null
  /** Close with remittances still waiting (needs a note). Open shifts always block. */
  force: boolean
}

export function closeBusinessDay(client: CashRpcClient, input: CloseDayInput): Promise<DayCloseCallResult<{ id: string; version: number }>> {
  const note = clean(input.note, DAY_CLOSE_NOTE_MAX)
  if (!DAY.safeParse(input.day).success) return Promise.resolve(refused('invalid', 'That day can’t be read.'))
  if (input.force && note === null) return Promise.resolve(refused('invalid', DAY_CLOSE_COPY.noteRequired))
  return call(
    client,
    'close_business_day',
    { p_tenant: input.tenantId, p_outlet: input.outletId, p_day: input.day, p_note: note, p_force: input.force },
    (data) => z.object({ id: z.string(), version: z.number().int() }).parse(data),
    DAY_CLOSE_COPY.forbidden,
  )
}

export function reopenBusinessDay(client: CashRpcClient, closeId: string, reason: string): Promise<DayCloseCallResult<null>> {
  const cleaned = clean(reason, REOPEN_REASON_MAX)
  if (!UUID.safeParse(closeId).success) return Promise.resolve(refused('invalid', 'That close can’t be found.'))
  if (cleaned === null) return Promise.resolve(refused('invalid', DAY_CLOSE_COPY.noteRequired))
  return call(client, 'reopen_business_day', { p_close_id: closeId, p_reason: cleaned }, () => null, DAY_CLOSE_COPY.reopenForbidden)
}

export interface DepositInput {
  closeId: string
  cents: number
  /** "BDO savings", "Safe". */
  to: string
  ref: string | null
  proofUrl: string | null
}

export async function recordDayDeposit(client: CashRpcClient, input: DepositInput): Promise<DayCloseCallResult<null>> {
  const to = clean(input.to, DEPOSIT_TEXT_MAX)
  if (!UUID.safeParse(input.closeId).success) return refused('invalid', 'That close can’t be found.')
  if (!Number.isInteger(input.cents) || input.cents < 0 || input.cents > MAX_DEPOSIT_CENTS) return refused('invalid', 'Type the amount deposited in pesos.')
  if (to === null) return refused('invalid', 'Say where it went, like “BDO savings” or “Safe”.')
  const result = await call(
    client,
    'record_day_deposit',
    { p_close_id: input.closeId, p_cents: input.cents, p_to: to, p_ref: clean(input.ref, DEPOSIT_TEXT_MAX), p_proof_url: clean(input.proofUrl, 2048) },
    () => null,
    DAY_CLOSE_COPY.forbidden,
  )
  // Set once: a second deposit on the same close is a refusal, not a failure.
  if (!result.ok && result.reason === 'already_closed') return refused('already_closed', DAY_CLOSE_COPY.depositTaken)
  return result
}

/** One close, masked by the database for a caller without `reports`. */
export async function getBusinessDayClose(client: CashRpcClient, closeId: string): Promise<CashResult<DayClose | null>> {
  if (!UUID.safeParse(closeId).success) return cashFailure('invalid', 'That close can’t be found.')
  const result = await call(client, 'get_business_day_close', { p_close_id: closeId }, (data) => (data === null ? null : parseDayClose(data)), DAY_CLOSE_COPY.forbidden)
  if (result.ok) return result
  return cashFailure(result.reason === 'forbidden' ? 'forbidden' : 'failed', result.reason === 'forbidden' ? result.message : DAY_CLOSE_COPY.loadFailed)
}

const LIST_COLUMNS = FIELDS.map(([, column]) => column).join(', ')
const LIST_LIMIT = 120

/** Closes for a range of business days (history), newest first, every version. Through RLS. */
export async function listDayCloses(
  db: SupabaseClient,
  query: { tenantId: string; fromDay: string; toDay: string; outletId: string | null },
): Promise<DayClose[]> {
  let request = db.from('business_day_closes').select(LIST_COLUMNS).eq('tenant_id', query.tenantId).gte('business_day', query.fromDay).lte('business_day', query.toDay)
  if (query.outletId) request = request.eq('outlet_id', query.outletId)
  const { data, error } = await request.order('business_day', { ascending: false }).order('version', { ascending: false }).limit(LIST_LIMIT)
  if (error) throw new Error(`Could not read the day closes: ${error.message}`)
  return (data ?? []).map(parseDayClose)
}
