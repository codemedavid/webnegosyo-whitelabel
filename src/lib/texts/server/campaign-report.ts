/**
 * One campaign's report: totals, each send (run), and the guests page by page
 * (masked names, last four digits, never the whole number). Server-only.
 *
 * The guest list pages through a campaign's server texts (sms_outbox) and then
 * its phone-sent texts (sms_sends), 50 at a time, by keyset on id. The cursor
 * is opaque to the page: `s:<last id>` / `p:<last id>`, or `p:` to start the
 * phone-sent phase.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { maskGuestName } from '@/lib/sms-automations/planner'
import type { OrderBackend } from '@/lib/order-backend'
import type { CampaignReportGuest, CampaignRunReport } from '../types'
import type { RunDetail } from './campaign-runs'
import {
  OUTBOX_SEND_COLUMNS, SMS_SEND_COLUMNS, comeBackKey, findComebacks, notSentReasonText, type RunResult, type SendRecord,
} from './campaign-results'

export const GUEST_PAGE_SIZE = 50
/** Newest runs whose guests the list covers (a 6-month daily repeat stays inside it). */
const MAX_RUNS_LISTED = 200
const CURSOR = /^([sp]):([0-9a-f-]{36})?$/

type Phase = 's' | 'p'

export function runReportsOf(results: ReadonlyMap<string, RunResult>, runs: readonly RunDetail[]): CampaignRunReport[] {
  return [...runs]
    .sort((a, b) => (b.startedAt ?? b.dueAt).localeCompare(a.startedAt ?? a.dueAt))
    .flatMap((run) => {
      const result = results.get(run.id)
      if (!result) return []
      const { runId, sent, notSent, waiting, cameBack, sales, notSentByReason } = result
      return [{ runId, startedAt: run.startedAt ?? run.dueAt, sent, notSent, waiting, cameBack, sales, notSentByReason }]
    })
}

function parseCursor(cursor: string | null, hasServer: boolean): { phase: Phase; afterId: string | null } | null {
  if (!cursor) return { phase: hasServer ? 's' : 'p', afterId: null }
  const match = CURSOR.exec(cursor)
  return match ? { phase: match[1] as Phase, afterId: match[2] ?? null } : null
}

type Named = { customers?: { name: string | null } | null }

async function readPhase(db: SupabaseClient, tenantId: string, phase: Phase, runIds: string[], afterId: string | null) {
  const base = phase === 's'
    ? db.from('sms_outbox').select(`${OUTBOX_SEND_COLUMNS}, customers(name)`).eq('tenant_id', tenantId).in('campaign_run_id', runIds)
    : db.from('sms_sends').select(`${SMS_SEND_COLUMNS}, customers(name)`).eq('tenant_id', tenantId).in('run_id', runIds)
  const request = afterId ? base.gt('id', afterId) : base
  const { data, error } = await request.order('id').limit(GUEST_PAGE_SIZE + 1)
  if (error) throw new Error(`campaign guests could not be read: ${error.message}`)
  return (data ?? []) as unknown as Array<Record<string, unknown> & Named>
}

function toSend(phase: Phase, row: Record<string, unknown>): SendRecord {
  const status = phase === 's'
    ? (row.status === 'sent' ? 'sent' : row.status === 'queued' || row.status === 'claimed' ? 'waiting' : 'not_sent')
    : (row.result === 'sent' ? 'sent' : 'not_sent')
  const reason = phase === 's' ? (row.error ?? row.skip_reason ?? row.status) : row.result
  return {
    id: String(row.id), runId: String(phase === 's' ? row.campaign_run_id : row.run_id), customerId: (row.customer_id as string | null) ?? null,
    phone: String(row.phone_e164 ?? ''), status, reason: status === 'not_sent' ? String(reason) : null,
    sentAt: status === 'sent' ? (row.sent_at as string | null) ?? null : null,
  }
}

export interface GuestPage {
  guests: CampaignReportGuest[]
  nextCursor: string | null
}

export async function readGuestPage(
  db: SupabaseClient, tenantId: string, backend: OrderBackend, runs: readonly RunDetail[], cursor: string | null,
): Promise<GuestPage> {
  const recent = [...runs].sort((a, b) => b.dueAt.localeCompare(a.dueAt)).slice(0, MAX_RUNS_LISTED)
  const ids = { s: recent.filter((r) => r.delivery === 'server').map((r) => r.id), p: recent.filter((r) => r.delivery === 'phone').map((r) => r.id) }
  const position = parseCursor(cursor, ids.s.length > 0)
  if (!position || ids[position.phase].length === 0) return { guests: [], nextCursor: null }
  const rows = await readPhase(db, tenantId, position.phase, ids[position.phase], position.afterId)
  const page = rows.slice(0, GUEST_PAGE_SIZE)
  const sends = page.map((row) => toSend(position.phase, row))
  const comebacks = await findComebacks(db, tenantId, backend, sends)
  const guests = sends.map((send, index): CampaignReportGuest => {
    const back = send.customerId && send.sentAt ? comebacks.get(comeBackKey(send.customerId, send.sentAt)) : undefined
    return {
      label: `${maskGuestName(page[index].customers?.name ?? null)} · ending ${send.phone.slice(-4)}`,
      status: send.status,
      reason: send.status === 'not_sent' ? notSentReasonText(send.reason) : null,
      sentAt: send.sentAt,
      orderedAt: back?.orderedAt ?? null,
      orderTotal: back && backend === 'platform' ? back.total : null,
    }
  })
  const nextCursor = rows.length > GUEST_PAGE_SIZE
    ? `${position.phase}:${String(page[page.length - 1].id)}`
    : position.phase === 's' && ids.p.length > 0 ? 'p:' : null
  return { guests, nextCursor }
}
