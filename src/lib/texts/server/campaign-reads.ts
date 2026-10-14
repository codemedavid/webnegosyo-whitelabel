/**
 * Read side of web Texts campaigns. Server-only — call with the service-role
 * client AFTER the caller passed `requireTextsAccess` (gate.ts).
 *
 *   listCampaignsView       the list (derived chips, progress, results)
 *   previewCampaignAudience the composer's live count (campaign-preview.ts)
 *   getCampaignReport       one campaign's report + a page of guests
 *   readCampaignProgress    open server runs, keyed by campaign (live poll)
 *   readThirtyDayLine       campaigns + automations: sent / came back / sales
 *
 * "Phone ready" = an enabled phone checked in within 30 minutes (the same
 * line phone-health draws for "offline").
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isQuietAt } from '@/lib/sms-automations/quiet-hours'
import { readOutlook, readSettings } from '@/lib/sms-automations/api/reads'
import type { AutomationSettings } from '@/lib/sms-automations/types'
import { CAMPAIGN_COLUMNS, campaignFromRow, toCampaignListItem, type CampaignRecord } from '../campaign-view'
import type { CampaignListItem, CampaignReport, CampaignRunProgress, ThirtyDayLine } from '../types'
import { readPhoneReadiness, readStoreFacts, type PhoneReadiness, type StoreFacts } from './audience-inputs'
import { readCampaign } from './campaign-run'
import { computeRunResults, findComebacks, totalsOf, type RunResult, type SendRecord } from './campaign-results'
import { readGuestPage, runReportsOf } from './campaign-report'
import { readRecentRuns, readRunsForCampaigns, type RunDetail } from './campaign-runs'
import { readAll } from './paged'

export { previewCampaignAudience } from './campaign-preview'

const DAY_MS = 86_400_000
const THIRTY_DAYS = 30
const MAX_CAMPAIGNS = 500
const MAX_OPEN_RUNS = 50
const MAX_LINE_ROWS = 20_000

// ─── Progress ────────────────────────────────────────────────────────────────

async function countRunTexts(db: SupabaseClient, tenantId: string, runId: string, statuses: string[]): Promise<number> {
  const { count, error } = await db.from('sms_outbox').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('campaign_run_id', runId).in('status', statuses)
  if (error) throw new Error(`campaign progress could not be read: ${error.message}`)
  return count ?? 0
}

interface ProgressContext {
  settings: AutomationSettings
  phones: PhoneReadiness
  finishAt: string | null
  now: Date
}

async function progressOf(db: SupabaseClient, tenantId: string, run: { id: string; planned_count: number | null }, ctx: ProgressContext): Promise<CampaignRunProgress> {
  const [sent, waiting, notSent] = await Promise.all([
    countRunTexts(db, tenantId, run.id, ['sent']),
    countRunTexts(db, tenantId, run.id, ['queued', 'claimed']),
    countRunTexts(db, tenantId, run.id, ['failed', 'cancelled', 'expired', 'skipped']),
  ])
  return {
    runId: run.id, sent, notSent, waiting,
    total: Math.max(run.planned_count ?? 0, sent + waiting + notSent),
    finishAt: waiting > 0 ? ctx.finishAt : null,
    isQuietNow: isQuietAt(ctx.now, ctx.settings.quietHoursStart, ctx.settings.quietHoursEnd),
    isWaitingForPhone: !ctx.phones.isReady,
  }
}

export async function readCampaignProgress(db: SupabaseClient, tenantId: string, now: Date): Promise<Record<string, CampaignRunProgress>> {
  const { data, error } = await db.from('sms_campaign_runs').select('id, campaign_id, planned_count')
    .eq('tenant_id', tenantId).eq('delivery', 'server').in('status', ['pending', 'running']).order('id').limit(MAX_OPEN_RUNS)
  if (error) throw new Error(`open campaign runs could not be read: ${error.message}`)
  const runs = (data ?? []) as { id: string; campaign_id: string; planned_count: number | null }[]
  if (runs.length === 0) return {}
  const settings = await readSettings(db, tenantId)
  const [phones, outlook] = await Promise.all([readPhoneReadiness(db, tenantId, now), readOutlook(db, tenantId, settings, now)])
  const ctx: ProgressContext = { settings, phones, finishAt: outlook.finishAt, now }
  const entries = await Promise.all(runs.map(async (run) => [run.campaign_id, await progressOf(db, tenantId, run, ctx)] as const))
  return Object.fromEntries(entries)
}

// ─── List ────────────────────────────────────────────────────────────────────

const SORT_GROUP: Readonly<Record<CampaignListItem['displayState'], number>> = {
  sending: 0, waiting_for_phone: 1, scheduled: 2, repeating: 2, app_managed: 3, paused: 4, draft: 5, sent: 6, finished: 6, archived: 7,
}

function compareItems(a: CampaignListItem, b: CampaignListItem): number {
  const group = SORT_GROUP[a.displayState] - SORT_GROUP[b.displayState]
  if (group !== 0) return group
  if (SORT_GROUP[a.displayState] === 2) return (a.nextSendAt ?? '').localeCompare(b.nextSendAt ?? '')
  return b.updatedAt.localeCompare(a.updatedAt)
}

interface ListContext {
  runs: RunDetail[]
  results: Map<string, RunResult>
  progress: Record<string, CampaignRunProgress>
  settings: AutomationSettings
  phones: PhoneReadiness
  store: StoreFacts
  now: Date
}

function itemOf(campaign: CampaignRecord, ctx: ListContext): CampaignListItem {
  const runs = ctx.runs.filter((run) => run.campaignId === campaign.id)
  const results = runs.flatMap((run) => ctx.results.get(run.id) ?? [])
  return toCampaignListItem(campaign, {
    runs,
    progress: ctx.progress[campaign.id] ?? null,
    results: totalsOf(results, ctx.store.orderBackend !== 'platform'),
    isPhoneReady: ctx.phones.isReady,
    quietHours: { start: ctx.settings.quietHoursStart, end: ctx.settings.quietHoursEnd },
    now: ctx.now,
  })
}

async function readCampaignRows(db: SupabaseClient, tenantId: string): Promise<CampaignRecord[]> {
  const { data, error } = await db.from('sms_campaigns').select(CAMPAIGN_COLUMNS)
    .eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(MAX_CAMPAIGNS)
  if (error) throw new Error(`campaigns could not be read: ${error.message}`)
  return ((data ?? []) as unknown as Record<string, unknown>[]).flatMap((row) => campaignFromRow(row) ?? [])
}

async function listContext(db: SupabaseClient, tenantId: string, runs: RunDetail[], now: Date): Promise<ListContext> {
  const settings = await readSettings(db, tenantId)
  const [phones, store, progress] = await Promise.all([
    readPhoneReadiness(db, tenantId, now), readStoreFacts(db, tenantId), readCampaignProgress(db, tenantId, now),
  ])
  const results = await computeRunResults(db, tenantId, store.orderBackend, runs.filter((run) => run.status !== 'pending'), now)
  return { runs, results, progress, settings, phones, store, now }
}

export async function listCampaignsView(db: SupabaseClient, tenantId: string, now: Date): Promise<CampaignListItem[]> {
  const [campaigns, runs] = await Promise.all([readCampaignRows(db, tenantId), readRecentRuns(db, tenantId)])
  const ctx = await listContext(db, tenantId, runs, now)
  return campaigns.map((campaign) => itemOf(campaign, ctx)).sort(compareItems)
}

// ─── Report ──────────────────────────────────────────────────────────────────

export async function getCampaignReport(
  db: SupabaseClient, tenantId: string, campaignId: string, cursor: string | null, now: Date,
): Promise<CampaignReport | null> {
  const campaign = await readCampaign(db, tenantId, campaignId)
  if (!campaign) return null
  const runs = await readRunsForCampaigns(db, tenantId, [campaignId])
  const ctx = await listContext(db, tenantId, runs, now)
  const item = itemOf(campaign, ctx)
  const page = await readGuestPage(db, tenantId, ctx.store.orderBackend, runs, cursor)
  return { campaign: item, totals: item.results, runs: runReportsOf(ctx.results, runs), guests: page.guests, nextCursor: page.nextCursor }
}

// ─── 30-day line ─────────────────────────────────────────────────────────────

type SentRow = { customer_id: string | null; sent_at: string | null }

/** Every text that went out in 30 days (automations + campaigns, server + phone). */
export async function readThirtyDayLine(db: SupabaseClient, tenantId: string, now: Date): Promise<ThirtyDayLine> {
  const since = new Date(now.getTime() - THIRTY_DAYS * DAY_MS).toISOString()
  const [outbox, sends, store] = await Promise.all([
    readAll<SentRow>('texts sent', (from, to) => db.from('sms_outbox').select('customer_id, sent_at')
      .eq('tenant_id', tenantId).eq('status', 'sent').gte('sent_at', since).order('id').range(from, to), { maxRows: MAX_LINE_ROWS }),
    readAll<SentRow>('campaign sends', (from, to) => db.from('sms_sends').select('customer_id, sent_at')
      .eq('tenant_id', tenantId).eq('result', 'sent').gte('sent_at', since).order('id').range(from, to), { maxRows: MAX_LINE_ROWS }),
    readStoreFacts(db, tenantId),
  ])
  const all = [...outbox, ...sends]
  const firstByGuest = new Map<string, string>()
  for (const row of all) {
    if (!row.customer_id || !row.sent_at) continue
    const current = firstByGuest.get(row.customer_id)
    if (!current || row.sent_at < current) firstByGuest.set(row.customer_id, row.sent_at)
  }
  const records: SendRecord[] = [...firstByGuest.entries()].map(([customerId, sentAt]) => ({
    id: customerId, runId: '', customerId, phone: '', status: 'sent', reason: null, sentAt,
  }))
  const comebacks = await findComebacks(db, tenantId, store.orderBackend, records)
  return {
    sent: all.length,
    cameBack: comebacks.size,
    sales: [...comebacks.values()].reduce((sum, back) => sum + back.total, 0),
  }
}
