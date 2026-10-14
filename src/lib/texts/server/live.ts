/**
 * What GET /api/admin/texts/live returns, polled every 30s (10s while
 * something is sending): the phone hero, Needs attention, and open-run
 * progress for the campaign list. Server-only.
 *
 * Each part degrades on its own: a failed campaign read drops campaign rows
 * from Needs attention, never the phone state; a failed phone read is the
 * hero's "Can't check" (`readSenderSummary`).
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'
import { buildAttention } from '../attention'
import { listCampaignsView, readCampaignProgress } from './campaign-reads'
import { readSenderSummary, type ProgressByCampaign } from './sender-summary'
import type { CampaignListItem, TextsLive } from '../types'

const log = createLogger('[Texts]', 'DEBUG_SMS_AUTOMATIONS')
/** Enough recent server runs to see the latest one of every scheduled campaign. */
const RECENT_RUNS = 200

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

/** Campaigns whose latest server run found no one to text (a proxy for "no one matches right now"). */
export async function readEmptyAudienceIds(db: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data, error } = await db.from('sms_campaign_runs').select('campaign_id, planned_count')
    .eq('tenant_id', tenantId).eq('delivery', 'server').eq('status', 'completed')
    .order('created_at', { ascending: false }).limit(RECENT_RUNS)
  if (error) throw new Error(`recent runs: ${error.message}`)
  const latest = new Map<string, number | null>()
  for (const run of (data ?? []) as Array<{ campaign_id: string; planned_count: number | null }>) {
    if (!latest.has(run.campaign_id)) latest.set(run.campaign_id, run.planned_count)
  }
  return [...latest].filter(([, planned]) => planned === 0).map(([id]) => id)
}

export interface LiveKnown {
  /** The page load already lists campaigns; pass its promise so they are read once. */
  campaigns?: Promise<CampaignListItem[]>
}

export async function readTextsLive(db: SupabaseClient, tenantId: string, now: Date, known: LiveKnown = {}): Promise<TextsLive> {
  const progressRead = softly<ProgressByCampaign>('campaign progress', tenantId, () => readCampaignProgress(db, tenantId, now), {})
  const [progress, sender, campaigns, isReviewLinkMissing, emptyAudienceCampaignIds] = await Promise.all([
    progressRead,
    progressRead.then((byCampaign) => readSenderSummary(db, tenantId, now, { progress: byCampaign })),
    softly('campaigns', tenantId, () => known.campaigns ?? listCampaignsView(db, tenantId, now), [] as CampaignListItem[]),
    softly('review link', tenantId, () => readReviewLinkMissing(db, tenantId), false),
    softly('recent runs', tenantId, () => readEmptyAudienceIds(db, tenantId), [] as string[]),
  ])
  const attention = buildAttention({ now, sender, campaigns, emptyAudienceCampaignIds, isReviewLinkMissing })
  return { sender, attention, progress }
}
