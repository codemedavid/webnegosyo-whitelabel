/**
 * Remittances (CONTRACTS W2.2 `cash_remittances`): the cash a cashier hands
 * over at the end of a shift (`kind: 'shift'`) or mid-shift (`kind: 'pickup'`),
 * and what the receiver says came in.
 *
 * pending → accepted (received = handed over, or a different amount with a
 * note) · pending → disputed · disputed → resolved (owner). Every transition
 * is a definer RPC with a CAS on `status`; this module only calls them and
 * parses what comes back. Reads are plain RLS reads through the caller's
 * session (the cashier sees their own; cash managers what they reach).
 *
 * The row parser accepts the table's snake_case AND the RPCs' camelCase, so
 * one type serves both. Web twin of `webnegosyo-app/lib/cash/remittances.ts`
 * (owner: app-owner).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { callCashRpc, cashFailure, type CashResult, type CashRpcClient } from './cash-rpc'

export const REMITTANCE_STATUSES = ['pending', 'accepted', 'disputed', 'resolved'] as const
export type RemittanceStatus = (typeof REMITTANCE_STATUSES)[number]

export interface Remittance {
  id: string
  tenantId: string
  outletId: string | null
  kind: 'shift' | 'pickup'
  shiftId: string | null
  businessDay: string | null
  cashierUserId: string | null
  cashierName: string
  handedOverCents: number
  /** Who the cashier named to receive it; null with `toSafe` = the store safe. */
  remittedTo: string | null
  remittedToName: string | null
  toSafe: boolean
  status: RemittanceStatus
  receivedCents: number | null
  receivedByName: string | null
  receivedAt: string | null
  acceptMethod: 'app' | 'pin' | null
  isSelfReceived: boolean
  receiverNote: string | null
  disputeReason: string | null
  resolvedAt: string | null
  resolvedByName: string | null
  resolvedNote: string | null
  createdAt: string
}

/** Largest single remittance we accept as input: ₱10,000,000. */
export const MAX_REMITTANCE_CENTS = 1_000_000_000
export const REMITTANCE_NOTE_MAX = 500

const centsValue = z.union([z.number().int(), z.string().regex(/^-?\d+$/).transform(Number)])

const FIELDS: ReadonlyArray<readonly [keyof Remittance, string]> = [
  ['id', 'id'],
  ['tenantId', 'tenant_id'],
  ['outletId', 'outlet_id'],
  ['kind', 'kind'],
  ['shiftId', 'shift_id'],
  ['businessDay', 'business_day'],
  ['cashierUserId', 'cashier_user_id'],
  ['cashierName', 'cashier_name'],
  ['handedOverCents', 'handed_over_cents'],
  ['remittedTo', 'remitted_to'],
  ['remittedToName', 'remitted_to_name'],
  ['toSafe', 'to_safe'],
  ['status', 'status'],
  ['receivedCents', 'received_cents'],
  ['receivedByName', 'received_by_name'],
  ['receivedAt', 'received_at'],
  ['acceptMethod', 'accept_method'],
  ['isSelfReceived', 'is_self_received'],
  ['receiverNote', 'receiver_note'],
  ['disputeReason', 'dispute_reason'],
  ['resolvedAt', 'resolved_at'],
  ['resolvedByName', 'resolved_by_name'],
  ['resolvedNote', 'resolved_note'],
  ['createdAt', 'created_at'],
]

const text = z.string().nullable().default(null)

const remittanceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  outletId: text,
  kind: z.enum(['shift', 'pickup']),
  shiftId: text,
  businessDay: text,
  cashierUserId: text,
  cashierName: z.string().nullable().default(null).transform((name) => name?.trim() || 'Staff'),
  handedOverCents: centsValue,
  remittedTo: text,
  remittedToName: text,
  toSafe: z.boolean().nullable().default(false).transform(Boolean),
  status: z.enum(REMITTANCE_STATUSES),
  receivedCents: centsValue.nullable().default(null),
  receivedByName: text,
  receivedAt: text,
  acceptMethod: z.enum(['app', 'pin']).nullable().default(null),
  isSelfReceived: z.boolean().nullable().default(false).transform(Boolean),
  receiverNote: text,
  disputeReason: text,
  resolvedAt: text,
  resolvedByName: text,
  resolvedNote: text,
  createdAt: z.string().min(1),
})

/** A table row or an RPC answer → Remittance. Throws on anything outside the contract. */
export function parseRemittance(data: unknown): Remittance {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('A remittance must be an object.')
  const source = data as Record<string, unknown>
  const picked = Object.fromEntries(
    FIELDS.map(([key, column]) => {
      const value = column in source ? source[column] : source[key]
      return [key, value === undefined ? undefined : value]
    }),
  )
  return remittanceSchema.parse(picked)
}

/** The difference the receiver found: received − handed over (null until received). */
export function remittanceDifferenceCents(remittance: Pick<Remittance, 'handedOverCents' | 'receivedCents'>): number | null {
  return remittance.receivedCents === null ? null : remittance.receivedCents - remittance.handedOverCents
}

const COLUMNS = FIELDS.map(([, column]) => column).join(', ')
const LIST_LIMIT = 200

interface ListQuery {
  tenantId: string
  statuses: readonly RemittanceStatus[]
  /** One business day, or null = any day (the inbox). */
  businessDay: string | null
  /** null = every branch the caller reaches. */
  outletId: string | null
}

/** Remittances through the caller's RLS, newest first (bounded: an inbox, not an archive). */
export async function listRemittances(db: SupabaseClient, query: ListQuery): Promise<Remittance[]> {
  let request = db.from('cash_remittances').select(COLUMNS).eq('tenant_id', query.tenantId).in('status', [...query.statuses])
  if (query.businessDay) request = request.eq('business_day', query.businessDay)
  if (query.outletId) request = request.eq('outlet_id', query.outletId)
  const { data, error } = await request.order('created_at', { ascending: false }).limit(LIST_LIMIT)
  if (error) throw new Error(`Could not read the remittances: ${error.message}`)
  return (data ?? []).map(parseRemittance)
}

export const REMITTANCE_FORBIDDEN_MESSAGE = 'Only the owner or someone who handles cash can receive this.'
export const REMITTANCE_CHANGED_MESSAGE = 'Someone already answered this remittance. Reload to see what they did.'
export const REMITTANCE_NOTE_REQUIRED = 'Say what happened. The cashier and the owner will see it.'
const REMITTANCE_FAILED = 'That didn’t save. Nothing changed. Try again in a moment.'

const UUID = z.string().uuid()
/**
 * A transition that lost its compare-and-set: serialization failure, or "no
 * pending row" (no_data_found). The remittance RPCs raise one of these.
 */
export const REMITTANCE_CONFLICT_CODES: ReadonlySet<string> = new Set(['40001', 'P0002'])

function transition(client: CashRpcClient, fn: string, args: Record<string, unknown>): Promise<CashResult<Remittance>> {
  if (!UUID.safeParse(args.p_id).success) return Promise.resolve(cashFailure('invalid', 'That remittance can’t be found.'))
  return callCashRpc(client, fn, args, parseRemittance, {
    forbiddenMessage: REMITTANCE_FORBIDDEN_MESSAGE,
    failedMessage: REMITTANCE_FAILED,
    invalidMessage: REMITTANCE_NOTE_REQUIRED,
    conflict: { codes: REMITTANCE_CONFLICT_CODES, message: REMITTANCE_CHANGED_MESSAGE },
  })
}

function isWholeCents(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_REMITTANCE_CENTS
}

function cleanNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? ''
  return trimmed === '' ? null : trimmed.slice(0, REMITTANCE_NOTE_MAX)
}

/** "Yes, I received ₱X" (same amount), or a different amount — which needs a note. */
export function acceptRemittance(
  client: CashRpcClient,
  remittance: Pick<Remittance, 'id' | 'handedOverCents'>,
  receivedCents: number,
  note: string | null,
): Promise<CashResult<Remittance>> {
  if (!isWholeCents(receivedCents)) return Promise.resolve(cashFailure('invalid', 'Type the amount you received in pesos.'))
  const cleaned = cleanNote(note)
  if (receivedCents !== remittance.handedOverCents && cleaned === null) return Promise.resolve(cashFailure('invalid', REMITTANCE_NOTE_REQUIRED))
  return transition(client, 'accept_remittance', { p_id: remittance.id, p_received_cents: receivedCents, p_note: cleaned })
}

/** "Something's wrong": a reason is required; the amount received is optional. */
export function disputeRemittance(client: CashRpcClient, id: string, reason: string, receivedCents: number | null): Promise<CashResult<Remittance>> {
  const cleaned = cleanNote(reason)
  if (cleaned === null) return Promise.resolve(cashFailure('invalid', REMITTANCE_NOTE_REQUIRED))
  if (receivedCents !== null && !isWholeCents(receivedCents)) return Promise.resolve(cashFailure('invalid', 'Type the amount you received in pesos.'))
  return transition(client, 'dispute_remittance', { p_id: id, p_reason: cleaned, p_received_cents: receivedCents })
}

/** The owner settles a dispute, saying how. */
export function resolveRemittance(client: CashRpcClient, id: string, note: string): Promise<CashResult<Remittance>> {
  const cleaned = cleanNote(note)
  if (cleaned === null) return Promise.resolve(cashFailure('invalid', REMITTANCE_NOTE_REQUIRED))
  return transition(client, 'resolve_remittance', { p_id: id, p_note: cleaned })
}
