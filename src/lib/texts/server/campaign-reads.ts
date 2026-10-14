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
import { createLogger } from '@/lib/logger'
import { isQuietAt } from '@/lib/sms-automations/quiet-hours'
import { readOutlook, readSettings } from '@/lib/sms-automations/api/reads'
import type { AutomationSettings } from '@/lib/sms-automations/types'
import { CAMPAIGN_COLUMNS, campaignFromRow, toCampaignListItem, type CampaignRecord } from '../campaign-view'
import type { CampaignListItem, CampaignReport, CampaignRunProgress, ThirtyDayLine } from '../types'
import { readPhoneReadiness, readStoreFacts, type PhoneReadiness, type StoreFacts } from './audience-inputs'
import { readCampaign } from './campaign-run'
import { CAME_BACK_WINDOW_DAYS, computeRunResults, totalsOf, type RunResult } from './campaign-results'
import { readGuestPage, runReportsOf } from './campaign-report'
import { readRecentRuns, readRunsForCampaigns, type RunDetail } from './campaign-runs'

export { previewCampaignAudience } from './campaign-preview'

const log = createLogger('[Texts]', 'DEBUG_SMS_AUTOMATIONS')

const DAY_MS = 86_400_000
const THIRTY_DAYS = 30
const MAX_CAMPAIGNS = 500
const MAX_OPEN_RUNS = 50

// ─── Progress ────────────────────────────────────────────────────────────────

type ProgressRow = { campaign_run_id: string; status: string; n: number | string }

const WAITING = new Set(['queued', 'claimed'])

/** One grouped read for every open run (service-role RPC `sms_campaign_run_progress`). */
async function readRunCounts(db: SupabaseClient, tenantId: string, runIds: string[]): Promise<Map<string, Record<'sent' | 'waiting' | 'notSent', number>>> {
  const { data, error } = await db.rpc('sms_campaign_run_progress', { p_tenant: tenantId, p_run_ids: runIds })
  if (error) throw new Error(`campaign progress could not be read: ${error.message}`)
  const counts = new Map(runIds.map((id) => [id, { sent: 0, waiting: 0, notSent: 0 }]))
  for (const row of (data ?? []) as ProgressRow[]) {
    const entry = counts.get(row.campaign_run_id)
    if (!entry) continue
    const bucket = row.status === 'sent' ? 'sent' : WAITING.has(row.status) ? 'waiting' : 'notSent'
    counts.set(row.campaign_run_id, { ...entry, [bucket]: entry[bucket] + Number(row.n) })
  }
  return counts
}

interface ProgressContext {
  settings: AutomationSettings
  phones: PhoneReadiness
  finishAt: string | null
  now: Date
}

function progressOf(run: { id: string; planned_count: number | null }, counts: Record<'sent' | 'waiting' | 'notSent', number>, ctx: ProgressContext): CampaignRunProgress {
  const { sent, waiting, notSent } = counts
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
  const [phones, outlook, counts] = await Promise.all([
    readPhoneReadiness(db, tenantId, now), readOutlook(db, tenantId, settings, now), readRunCounts(db, tenantId, runs.map((run) => run.id)),
  ])
  const ctx: ProgressContext = { settings, phones, finishAt: outlook.finishAt, now }
  const zero = { sent: 0, waiting: 0, notSent: 0 }
  return Object.fromEntries(runs.map((run) => [run.campaign_id, progressOf(run, counts.get(run.id) ?? zero, ctx)]))
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
    readPhoneReadiness(db, tenantId, now), readStoreFacts(db, tenantId),
    // Progress is decoration on the list: a failed read shows no bar rather than no campaigns.
    readCampaignProgress(db, tenantId, now).catch((error: unknown) => {
      log.error('campaign progress unavailable', { tenantId, error: error instanceof Error ? error.message : String(error) })
      return {} as Record<string, CampaignRunProgress>
    }),
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

const ZERO_LINE: ThirtyDayLine = Object.freeze({ sent: 0, cameBack: 0, sales: 0 }) as ThirtyDayLine

async function headCount(query: PromiseLike<{ count: number | null; error: { message: string } | null }>, label: string): Promise<number> {
  const { count, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return count ?? 0
}

async function readLine(db: SupabaseClient, tenantId: string, now: Date): Promise<ThirtyDayLine> {
  const since = new Date(now.getTime() - THIRTY_DAYS * DAY_MS).toISOString()
  const [outboxSent, phoneSent, store] = await Promise.all([
    headCount(db.from('sms_outbox').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'sent').gte('sent_at', since), 'texts sent'),
    headCount(db.from('sms_sends').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('result', 'sent').gte('sent_at', since), 'campaign sends'),
    readStoreFacts(db, tenantId),
  ])
  // Each texted guest's first order within 14 days of their first text — aggregated in SQL (no rows read).
  const { data, error } = await db.rpc('sms_texts_came_back', {
    p_tenant: tenantId, p_since: since, p_window_days: CAME_BACK_WINDOW_DAYS, p_exact: store.orderBackend === 'platform',
  })
  if (error) throw new Error(`came back: ${error.message}`)
  const row = ((data ?? []) as { came_back: number | string; sales: number | string | null }[])[0]
  return { sent: outboxSent + phoneSent, cameBack: Number(row?.came_back ?? 0), sales: Number(row?.sales ?? 0) }
}

/** Every text that went out in 30 days (automations + campaigns, server + phone). Never throws: zeros + a log. */
export async function readThirtyDayLine(db: SupabaseClient, tenantId: string, now: Date): Promise<ThirtyDayLine> {
  try {
    return await readLine(db, tenantId, now)
  } catch (error) {
    log.error('30-day texts line unavailable', { tenantId, error: error instanceof Error ? error.message : String(error) })
    return { ...ZERO_LINE }
  }
}
