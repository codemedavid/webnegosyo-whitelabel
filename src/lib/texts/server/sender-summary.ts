/**
 * The phone hero on /admin/texts: every enabled phone, the queue, quiet
 * hours, and the campaign sending now — at the server's clock. Server-only.
 *
 * A failed read is `unknown` ("Can't check"), never `ready`. A failed
 * campaign-progress read only loses the "Sending" line; the phone state
 * still shows, because it does not depend on it.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'
import { isQuietAt, nextSendableAt } from '@/lib/sms-automations/quiet-hours'
import { readOutlook, readSettings, type DeliveryOutlook } from '@/lib/sms-automations/api/reads'
import { settingsFromRow } from '@/lib/sms-automations/rows'
import type { AutomationSettings } from '@/lib/sms-automations/types'
import { readCampaignProgress } from './campaign-reads'
import { heroStateFor, pickPrimaryPhone, withDistinctNames } from '../phone-health'
import { MAX_SENDER_PHONES, readSenderDevices, toSendingPhone, type SenderDeviceRow } from './phones'
import type { CampaignRunProgress, SenderSummary } from '../types'

const log = createLogger('[Texts]', 'DEBUG_SMS_AUTOMATIONS')
export type ProgressByCampaign = Record<string, CampaignRunProgress>
type SendingLine = NonNullable<SenderSummary['sending']>

export interface SummaryParts {
  now: Date
  settings: AutomationSettings
  outlook: DeliveryOutlook
  rows: SenderDeviceRow[]
  /** The campaign sending now, if any (already named). */
  sending: SendingLine | null
}

/** Pure assembly of the hero from what was read. */
export function summarise({ now, settings, outlook, rows, sending }: SummaryParts): SenderSummary {
  const isQuietNow = isQuietAt(now, settings.quietHoursStart, settings.quietHoursEnd)
  const ctx = { now, isQuietNow, isLimitReached: outlook.sentToday >= outlook.dailyLimit }
  const phones = withDistinctNames(rows.map((row) => toSendingPhone(row, ctx)))
  const primary = pickPrimaryPhone(phones)
  return {
    heroState: heroStateFor({ primary, hasReadError: false, hasOpenRun: sending !== null }),
    primary,
    phones,
    maxPhones: MAX_SENDER_PHONES,
    waiting: outlook.waiting,
    sentToday: outlook.sentToday,
    dailyLimit: outlook.dailyLimit,
    isQuietNow,
    quietUntil: isQuietNow ? nextSendableAt(now, settings.quietHoursStart, settings.quietHoursEnd).toISOString() : null,
    allOutBy: outlook.waiting > 0 ? outlook.finishAt : null,
    sending,
    now: now.toISOString(),
  }
}

/** The page says "Can't check" — and nothing it shows pretends to know more. */
export function unknownSummary(now: Date): SenderSummary {
  return {
    heroState: 'unknown', primary: null, phones: [], maxPhones: MAX_SENDER_PHONES, waiting: 0, sentToday: 0,
    dailyLimit: settingsFromRow(null).dailyLimit, isQuietNow: false, quietUntil: null, allOutBy: null, sending: null,
    now: now.toISOString(),
  }
}

/** The open run with the most still to go, or null. */
export function pickSendingRun(progress: ProgressByCampaign): { campaignId: string; run: CampaignRunProgress } | null {
  const open = Object.entries(progress)
    .map(([campaignId, run]) => ({ campaignId, run, left: run.total - run.sent - run.notSent }))
    .filter((entry) => entry.left > 0)
    .sort((a, b) => b.left - a.left || a.campaignId.localeCompare(b.campaignId))
  return open[0] ?? null
}

async function nameSendingRun(db: SupabaseClient, tenantId: string, progress: ProgressByCampaign): Promise<SendingLine | null> {
  const picked = pickSendingRun(progress)
  if (!picked) return null
  const { data, error } = await db.from('sms_campaigns').select('name')
    .eq('tenant_id', tenantId).eq('id', picked.campaignId).maybeSingle()
  if (error) throw new Error(`campaign name: ${error.message}`)
  const name = (data as { name?: string } | null)?.name ?? 'Campaign'
  const { run } = picked
  return { id: picked.campaignId, name, sent: run.sent, total: run.total, finishAt: run.finishAt }
}

async function readProgressSafely(db: SupabaseClient, tenantId: string, now: Date): Promise<ProgressByCampaign> {
  try {
    return await readCampaignProgress(db, tenantId, now)
  } catch (error) {
    log.error('campaign progress unavailable', { tenantId, error: error instanceof Error ? error.message : String(error) })
    return {}
  }
}

async function readSendingSafely(db: SupabaseClient, tenantId: string, progress: ProgressByCampaign): Promise<SendingLine | null> {
  try {
    return await nameSendingRun(db, tenantId, progress)
  } catch (error) {
    log.error('sending campaign unavailable', { tenantId, error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

/**
 * Pass `known.progress` when the caller has already read campaign progress
 * (the live endpoint does), so it is read once per poll.
 */
export async function readSenderSummary(
  db: SupabaseClient, tenantId: string, now: Date, known: { progress?: ProgressByCampaign } = {},
): Promise<SenderSummary> {
  // Never rejects, so it can start before the settings read without an unhandled rejection.
  const progress = known.progress ? Promise.resolve(known.progress) : readProgressSafely(db, tenantId, now)
  try {
    const settings = await readSettings(db, tenantId)
    const [outlook, rows, sending] = await Promise.all([
      readOutlook(db, tenantId, settings, now),
      readSenderDevices(db, tenantId, now),
      progress.then((byCampaign) => readSendingSafely(db, tenantId, byCampaign)),
    ])
    return summarise({ now, settings, outlook, rows, sending })
  } catch (error) {
    log.error('sender summary unavailable', { tenantId, error: error instanceof Error ? error.message : String(error) })
    return unknownSummary(now)
  }
}
