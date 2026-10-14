/**
 * Campaign results per run. Server-only (service role).
 *
 * "Came back" = the guest's first non-cancelled order after THEIR text and
 * within 14 days; "sales" = that order's total. Exact only where orders live
 * on the platform database (`resolveOrderBackend === 'platform'`); other
 * stores fall back to `customers.last_order_at` inside the window — a lower
 * bound ("at least"), with no sales figure.
 *
 * Once a run's window has closed its numbers cannot change, so they are
 * stored on the run (`report`, `report_final_at`) and never re-read: the list
 * stays bounded however long a store keeps texting.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'
import type { OrderBackend } from '@/lib/order-backend'
import { toManilaParts } from '../schedule'
import type { CampaignResults } from '../types'
import { isOpenRun, type RunDetail } from './campaign-runs'
import { chunk, readAll } from './paged'

const log = createLogger('[Texts]', 'DEBUG_SMS_AUTOMATIONS')
export const CAME_BACK_WINDOW_DAYS = 14
const DAY_MS = 86_400_000
const WINDOW_MS = CAME_BACK_WINDOW_DAYS * DAY_MS
const MAX_SEND_ROWS = 20_000

export type SendStatus = 'sent' | 'waiting' | 'not_sent'

export interface SendRecord {
  id: string
  runId: string
  customerId: string | null
  phone: string
  status: SendStatus
  /** Raw reason code (skip_reason / error / outbox status) when not sent. */
  reason: string | null
  sentAt: string | null
}

export interface ComeBack {
  orderedAt: string
  total: number
}

export interface RunResult {
  runId: string
  startedAt: string | null
  sent: number
  notSent: number
  waiting: number
  cameBack: number
  sales: number
  notSentByReason: Array<{ reason: string; count: number }>
  isFinal: boolean
  finalOn: string | null
}

const REASON_TEXT: Readonly<Record<string, string>> = Object.freeze({
  expired: 'Ran out of time',
  no_consent: "Hasn't agreed to texts",
  opted_out: 'Opted out',
  suppressed: 'On your do-not-text list',
  guest_changed: 'Number changed',
  paused: 'Paused',
  archived: 'Campaign archived',
  owner_cancelled: 'You cancelled it',
  unconfirmed: "Phone didn't confirm",
  failed: "Phone couldn't send",
  skipped: 'Skipped',
  cancelled: 'Cancelled',
})

export function notSentReasonText(code: string | null): string {
  return (code && REASON_TEXT[code]) ?? "Phone couldn't send"
}

// ─── Reading sends ───────────────────────────────────────────────────────────

type OutboxRow = { id: string; campaign_run_id: string; customer_id: string | null; phone_e164: string; status: string; skip_reason: string | null; error: string | null; sent_at: string | null }
type SendRow = { id: string; run_id: string; customer_id: string | null; phone_e164: string; result: string; error_code: string | null; sent_at: string | null }

function fromOutbox(row: OutboxRow): SendRecord {
  const status: SendStatus = row.status === 'sent' ? 'sent' : row.status === 'queued' || row.status === 'claimed' ? 'waiting' : 'not_sent'
  return {
    id: row.id, runId: row.campaign_run_id, customerId: row.customer_id, phone: row.phone_e164, status,
    reason: status === 'not_sent' ? row.error ?? row.skip_reason ?? row.status : null, sentAt: status === 'sent' ? row.sent_at : null,
  }
}

function fromSmsSends(row: SendRow): SendRecord {
  const status: SendStatus = row.result === 'sent' ? 'sent' : 'not_sent'
  return {
    id: row.id, runId: row.run_id, customerId: row.customer_id, phone: row.phone_e164, status,
    reason: status === 'not_sent' ? row.result : null, sentAt: status === 'sent' ? row.sent_at : null,
  }
}

export const OUTBOX_SEND_COLUMNS = 'id, campaign_run_id, customer_id, phone_e164, status, skip_reason, error, sent_at'
export const SMS_SEND_COLUMNS = 'id, run_id, customer_id, phone_e164, result, error_code, sent_at'

/** Every text of these runs: outbox rows for server runs, `sms_sends` for phone runs. */
export async function readRunSends(db: SupabaseClient, tenantId: string, runs: readonly RunDetail[]): Promise<SendRecord[]> {
  const serverIds = runs.filter((r) => r.delivery === 'server').map((r) => r.id)
  const phoneIds = runs.filter((r) => r.delivery === 'phone').map((r) => r.id)
  const reads = [
    ...chunk(serverIds).map((ids) => readAll<OutboxRow>('campaign texts', (from, to) => db.from('sms_outbox').select(OUTBOX_SEND_COLUMNS)
      .eq('tenant_id', tenantId).in('campaign_run_id', ids).order('id').range(from, to), { maxRows: MAX_SEND_ROWS }).then((rows) => rows.map(fromOutbox))),
    ...chunk(phoneIds).map((ids) => readAll<SendRow>('campaign sends', (from, to) => db.from('sms_sends').select(SMS_SEND_COLUMNS)
      .eq('tenant_id', tenantId).in('run_id', ids).order('id').range(from, to), { maxRows: MAX_SEND_ROWS }).then((rows) => rows.map(fromSmsSends))),
  ]
  return (await Promise.all(reads)).flat()
}

// ─── Came back ───────────────────────────────────────────────────────────────

export const comeBackKey = (customerId: string, sentAt: string): string => `${customerId}|${sentAt}`

type Sent = { customerId: string; sentAt: string }

async function platformComebacks(db: SupabaseClient, tenantId: string, sent: readonly Sent[]): Promise<Map<string, ComeBack>> {
  const times = sent.map((s) => Date.parse(s.sentAt))
  const since = new Date(Math.min(...times)).toISOString()
  const until = new Date(Math.max(...times) + WINDOW_MS).toISOString()
  const ids = [...new Set(sent.map((s) => s.customerId))]
  type OrderRow = { customer_id: string; created_at: string; total: unknown }
  const orders = (await Promise.all(chunk(ids).map((group) => readAll<OrderRow>('orders', (from, to) => db.from('orders')
    .select('customer_id, created_at, total').eq('tenant_id', tenantId).in('customer_id', group)
    .gt('created_at', since).lte('created_at', until).neq('status', 'cancelled')
    .order('created_at').order('id').range(from, to))))).flat()
  const byGuest = new Map<string, OrderRow[]>()
  for (const order of orders) byGuest.set(order.customer_id, [...(byGuest.get(order.customer_id) ?? []), order])
  const found = new Map<string, ComeBack>()
  for (const send of sent) {
    const start = Date.parse(send.sentAt)
    const first = (byGuest.get(send.customerId) ?? []).find((o) => Date.parse(o.created_at) > start && Date.parse(o.created_at) <= start + WINDOW_MS)
    if (first) found.set(comeBackKey(send.customerId, send.sentAt), { orderedAt: first.created_at, total: Number(first.total) || 0 })
  }
  return found
}

async function approximateComebacks(db: SupabaseClient, tenantId: string, sent: readonly Sent[]): Promise<Map<string, ComeBack>> {
  const ids = [...new Set(sent.map((s) => s.customerId))]
  type Row = { id: string; last_order_at: string | null }
  const rows = (await Promise.all(chunk(ids).map((group) => readAll<Row>('guests', (from, to) => db.from('customers')
    .select('id, last_order_at').eq('tenant_id', tenantId).in('id', group).order('id').range(from, to))))).flat()
  const lastOrder = new Map(rows.map((row) => [row.id, row.last_order_at]))
  const found = new Map<string, ComeBack>()
  for (const send of sent) {
    const last = lastOrder.get(send.customerId)
    const start = Date.parse(send.sentAt)
    if (last && Date.parse(last) > start && Date.parse(last) <= start + WINDOW_MS) {
      found.set(comeBackKey(send.customerId, send.sentAt), { orderedAt: last, total: 0 })
    }
  }
  return found
}

/** Keyed by `comeBackKey(customerId, sentAt)`. */
export async function findComebacks(
  db: SupabaseClient, tenantId: string, backend: OrderBackend, sends: readonly SendRecord[],
): Promise<Map<string, ComeBack>> {
  const sent = sends.flatMap((s) => (s.status === 'sent' && s.customerId && s.sentAt ? [{ customerId: s.customerId, sentAt: s.sentAt }] : []))
  if (sent.length === 0) return new Map()
  return backend === 'platform' ? platformComebacks(db, tenantId, sent) : approximateComebacks(db, tenantId, sent)
}

// ─── Summaries ───────────────────────────────────────────────────────────────

function reasonsOf(sends: readonly SendRecord[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>()
  for (const send of sends.filter((s) => s.status === 'not_sent')) {
    const text = notSentReasonText(send.reason)
    counts.set(text, (counts.get(text) ?? 0) + 1)
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
}

export function summarizeRun(run: RunDetail, sends: readonly SendRecord[], comebacks: ReadonlyMap<string, ComeBack>, now: Date): RunResult {
  const own = sends.filter((s) => s.runId === run.id)
  const sent = own.filter((s) => s.status === 'sent')
  const backs = sent.flatMap((s) => (s.customerId && s.sentAt ? [comebacks.get(comeBackKey(s.customerId, s.sentAt))] : [])).filter(Boolean) as ComeBack[]
  const lastSent = sent.reduce((max, s) => Math.max(max, Date.parse(s.sentAt as string)), 0)
  const closesAt = lastSent > 0 ? lastSent + WINDOW_MS : null
  const waiting = own.filter((s) => s.status === 'waiting').length
  return {
    runId: run.id,
    startedAt: run.startedAt ?? run.dueAt,
    sent: sent.length,
    notSent: own.filter((s) => s.status === 'not_sent').length,
    waiting,
    cameBack: backs.length,
    sales: backs.reduce((sum, b) => sum + b.total, 0),
    notSentByReason: reasonsOf(own),
    isFinal: !isOpenRun(run) && waiting === 0 && (closesAt === null || closesAt < now.getTime()),
    finalOn: closesAt === null ? null : toManilaParts(new Date(closesAt)).date,
  }
}

function cachedResult(run: RunDetail): RunResult | null {
  if (!run.reportFinalAt || !run.report || typeof run.report !== 'object') return null
  const report = run.report as Partial<RunResult>
  return typeof report.sent === 'number' ? { ...(report as RunResult), runId: run.id, isFinal: true } : null
}

async function storeFinal(db: SupabaseClient, tenantId: string, result: RunResult, now: Date): Promise<void> {
  const { error } = await db.from('sms_campaign_runs').update({ report: result, report_final_at: now.toISOString() })
    .eq('tenant_id', tenantId).eq('id', result.runId).is('report_final_at', null)
  if (error) log.error('final campaign report could not be stored', { tenantId, runId: result.runId, error: error.message })
}

export async function computeRunResults(
  db: SupabaseClient, tenantId: string, backend: OrderBackend, runs: readonly RunDetail[], now: Date,
): Promise<Map<string, RunResult>> {
  const results = new Map<string, RunResult>()
  const live = runs.filter((run) => {
    const cached = cachedResult(run)
    if (cached) results.set(run.id, cached)
    return !cached
  })
  if (live.length === 0) return results
  const sends = await readRunSends(db, tenantId, live)
  const comebacks = await findComebacks(db, tenantId, backend, sends)
  for (const run of live) {
    const result = summarizeRun(run, sends, comebacks, now)
    results.set(run.id, result)
    if (result.isFinal) await storeFinal(db, tenantId, result, now)
  }
  return results
}

/** One campaign's totals across its runs; null before anything went out. */
export function totalsOf(results: readonly RunResult[], isApproximate: boolean): CampaignResults | null {
  const sent = results.reduce((sum, r) => sum + r.sent, 0)
  const notSent = results.reduce((sum, r) => sum + r.notSent, 0)
  if (sent === 0 && notSent === 0) return null
  const open = results.filter((r) => !r.isFinal)
  const finalOn = open.reduce<string | null>((latest, r) => (r.finalOn && (!latest || r.finalOn > latest) ? r.finalOn : latest), null)
  return {
    sent,
    notSent,
    cameBack: results.reduce((sum, r) => sum + r.cameBack, 0),
    sales: results.reduce((sum, r) => sum + r.sales, 0),
    isFinal: open.length === 0,
    finalOn,
    isApproximate,
  }
}
