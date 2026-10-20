/**
 * What GET /api/admin/texts/live returns, polled every 30s (10s while
 * something is sending): the phone hero, Needs attention, and open-run
 * progress for the campaign list. Server-only.
 *
 * Only what changes fast, from bounded queries: the campaign rows of Needs
 * attention come from one select of live server campaigns plus their recent
 * runs — never the campaign list (`listCampaignsView` reads results across
 * every run). Several open tabs of one store share one read for
 * `LIVE_CACHE_MS` (`readTextsLiveCached`).
 *
 * Each part degrades on its own: a failed campaign read drops campaign rows
 * from Needs attention, never the phone state; a failed phone read is the
 * hero's "Can't check" (`readSenderSummary`).
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'
import { readSettings } from '@/lib/sms-automations/api/reads'
import { buildAttention, type AttentionCampaign } from '../attention'
import { campaignFromRow, deriveDisplayState, type CampaignRecord } from '../campaign-view'
import { nextServerDueAt, type QuietWindow, type RunStatus } from '../schedule'
import { readCampaignProgress } from './campaign-reads'
import { readSenderSummary, type ProgressByCampaign } from './sender-summary'
import type { SenderSummary, TextsLive } from '../types'

const log = createLogger('[Texts]', 'DEBUG_SMS_AUTOMATIONS')
/** Live server campaigns a store can have that matter here; more is not a real store. */
const MAX_ATTENTION_CAMPAIGNS = 100
const MAX_ATTENTION_RUNS = 1000
/** Repeats run at least every 90 days, so the latest run of a live repeat is within this. */
const RUN_LOOKBACK_MS = 100 * 86_400_000
const ATTENTION_CAMPAIGN_COLUMNS =
  'id, name, schedule_kind, schedule_time, schedule_date, schedule_interval_days, schedule_weekdays, ends_on, ' +
  'status, delivery, pause_reason, scheduled_from, created_at, updated_at'
export const LIVE_CACHE_MS = 5_000
const LIVE_CACHE_MAX_STORES = 500

async function softly<T>(what: string, tenantId: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch (error) {
    log.error(`${what} unavailable`, { tenantId, error: error instanceof Error ? error.message : String(error) })
    return fallback
  }
}

/** Review request is on and there is no review link to send. */
export async function readReviewLinkMissing(db: SupabaseClient, tenantId: string): Promise<boolean> {
  const [settings, automation] = await Promise.all([
    db.from('sms_settings').select('review_url').eq('tenant_id', tenantId).maybeSingle(),
    db.from('sms_automations').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('recipe', 'review_request').eq('status', 'on'),
  ])
  if (settings.error || automation.error) throw new Error('review link check failed')
  const reviewUrl = (settings.data as { review_url?: string | null } | null)?.review_url ?? null
  return (automation.count ?? 0) > 0 && !reviewUrl
}

interface RunFact {
  campaign_id: string
  status: RunStatus
  due_at: string
  planned_count: number | null
}

export interface CampaignFacts {
  campaigns: CampaignRecord[]
  /** Newest first. */
  runs: RunFact[]
  quiet: QuietWindow
}

const NO_FACTS: CampaignFacts = { campaigns: [], runs: [], quiet: { start: '21:00', end: '08:00' } }

/** Live server campaigns (scheduled or paused) and their recent runs: two bounded queries. */
export async function readCampaignFacts(db: SupabaseClient, tenantId: string, now: Date): Promise<CampaignFacts> {
  const [settings, campaigns] = await Promise.all([
    readSettings(db, tenantId),
    db.from('sms_campaigns').select(ATTENTION_CAMPAIGN_COLUMNS).eq('tenant_id', tenantId).eq('delivery', 'server')
      .in('status', ['scheduled', 'paused']).order('updated_at', { ascending: false }).limit(MAX_ATTENTION_CAMPAIGNS),
  ])
  if (campaigns.error) throw new Error(`live campaigns: ${campaigns.error.message}`)
  const records = ((campaigns.data ?? []) as unknown as Record<string, unknown>[]).flatMap((row) => campaignFromRow(row) ?? [])
  const quiet = { start: settings.quietHoursStart, end: settings.quietHoursEnd }
  if (records.length === 0) return { campaigns: [], runs: [], quiet }
  const runs = await db.from('sms_campaign_runs').select('campaign_id, status, due_at, planned_count').eq('tenant_id', tenantId)
    .in('campaign_id', records.map((record) => record.id)).gte('due_at', new Date(now.getTime() - RUN_LOOKBACK_MS).toISOString())
    .order('due_at', { ascending: false }).limit(MAX_ATTENTION_RUNS)
  if (runs.error) throw new Error(`live campaign runs: ${runs.error.message}`)
  return { campaigns: records, runs: (runs.data ?? []) as RunFact[], quiet }
}

/** Pure: the campaign side of Needs attention from the facts and the phone's state. */
export function campaignAttentionOf(facts: CampaignFacts, sender: SenderSummary, now: Date) {
  const isPhoneReady = sender.primary?.state === 'ready'
  const emptyAudienceCampaignIds: string[] = []
  const campaigns = facts.campaigns.map((campaign): AttentionCampaign => {
    const runs = facts.runs.filter((run) => run.campaign_id === campaign.id)
    const due = nextServerDueAt({
      schedule: campaign.schedule,
      scheduledFrom: campaign.scheduledFrom ? new Date(campaign.scheduledFrom) : null,
      createdAt: new Date(campaign.createdAt || now.toISOString()),
      runs: runs.map((run) => ({ dueAt: new Date(run.due_at), status: run.status })),
      quietHours: facts.quiet,
      now,
    })
    const hasOpenRun = runs.some((run) => run.status === 'pending' || run.status === 'running')
    const latestDone = runs.find((run) => run.status === 'completed')
    if (latestDone?.planned_count === 0) emptyAudienceCampaignIds.push(campaign.id)
    const displayState = deriveDisplayState({ ...campaign, hasAnyRun: runs.length > 0, hasOpenRun, isPhoneReady, due })
    return {
      id: campaign.id, name: campaign.name, status: campaign.status, displayState, pauseReason: campaign.pauseReason,
      nextSendAt: due.state === 'upcoming' && due.dueAt ? due.dueAt.toISOString() : null,
    }
  })
  return { campaigns, emptyAudienceCampaignIds }
}

const NO_CAMPAIGN_ROWS = { campaigns: [] as AttentionCampaign[], emptyAudienceCampaignIds: [] as string[] }

function campaignAttentionSafely(facts: CampaignFacts, sender: SenderSummary, now: Date, tenantId: string) {
  try {
    return campaignAttentionOf(facts, sender, now)
  } catch (error) {
    log.error('live campaign rows unavailable', { tenantId, error: error instanceof Error ? error.message : String(error) })
    return NO_CAMPAIGN_ROWS
  }
}

export async function readTextsLive(db: SupabaseClient, tenantId: string, now: Date): Promise<TextsLive> {
  const progressRead = softly<ProgressByCampaign>('campaign progress', tenantId, () => readCampaignProgress(db, tenantId, now), {})
  const [progress, sender, facts, isReviewLinkMissing] = await Promise.all([
    progressRead,
    progressRead.then((byCampaign) => readSenderSummary(db, tenantId, now, { progress: byCampaign })),
    softly('live campaigns', tenantId, () => readCampaignFacts(db, tenantId, now), NO_FACTS),
    softly('review link', tenantId, () => readReviewLinkMissing(db, tenantId), false),
  ])
  const attention = buildAttention({ now, sender, isReviewLinkMissing, ...campaignAttentionSafely(facts, sender, now, tenantId) })
  return { sender, attention, progress }
}

// ─── Per-store cache: several open tabs, one read ────────────────────────────

const liveCache = new Map<string, { at: number; value: Promise<TextsLive> }>()

/** Drop a store's cached view (after a write, so the next poll sees it). */
export function forgetTextsLive(tenantId: string): void {
  liveCache.delete(tenantId)
}

/** `readTextsLive`, shared for `LIVE_CACHE_MS` per store within this instance. A failed read is not kept. */
export function readTextsLiveCached(db: SupabaseClient, tenantId: string, now: Date): Promise<TextsLive> {
  const cached = liveCache.get(tenantId)
  if (cached && now.getTime() - cached.at < LIVE_CACHE_MS && now.getTime() >= cached.at) return cached.value
  const value = readTextsLive(db, tenantId, now)
  liveCache.delete(tenantId)
  liveCache.set(tenantId, { at: now.getTime(), value })
  if (liveCache.size > LIVE_CACHE_MAX_STORES) liveCache.delete(liveCache.keys().next().value as string)
  value.catch(() => {
    if (liveCache.get(tenantId)?.value === value) liveCache.delete(tenantId)
  })
  return value
}
