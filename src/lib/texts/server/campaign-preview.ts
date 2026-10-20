/**
 * "148 guests will get this": the composer's live audience preview.
 * Server-only (service role).
 *
 * Same plan as a real run (`planCampaignRun` over the same inputs), so the
 * count the owner sees is the count a run would queue right now. Guests who
 * can never be texted are head-counted, never downloaded.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { estimateDeliveryFinish } from '@/lib/sms-automations/eta'
import { readOutlook } from '@/lib/sms-automations/api/reads'
import { estimateCampaignSegments, renderCampaignMessage, SAMPLE_GUEST } from '../message'
import { planCampaignRun } from '../run-plan'
import { DEFAULT_EXPIRY_MS, toManilaParts } from '../schedule'
import type { AudienceFilter, AudiencePreview, SkippedReason } from '../types'
import { countIneligible, loadAudienceInputs } from './audience-inputs'

const DAY_MS = 86_400_000
const PREVIEW_RUN_ID = 'preview'

export interface PreviewInput {
  audience: AudienceFilter
  messageTemplate: string
}

function manilaDayIndex(instant: Date): number {
  return Math.floor(Date.parse(`${toManilaParts(instant).date}T00:00:00Z`) / DAY_MS)
}

/** Whole Manila days from today until the last text goes out (1 = today). */
function daysUntil(finishAt: Date | null, now: Date, total: number, dailyLimit: number): number {
  if (finishAt) return manilaDayIndex(finishAt) - manilaDayIndex(now) + 1
  return Math.max(1, Math.ceil(total / Math.max(1, dailyLimit)))
}

function nonZero(counts: Partial<Record<SkippedReason, number>>): Partial<Record<SkippedReason, number>> {
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => (count ?? 0) > 0))
}

export async function previewCampaignAudience(
  db: SupabaseClient, tenantId: string, input: PreviewInput, now: Date,
): Promise<AudiencePreview> {
  const [inputs, ineligible] = await Promise.all([loadAudienceInputs(db, tenantId, now), countIneligible(db, tenantId)])
  const { settings, store } = inputs
  const plan = planCampaignRun({
    tenantId, runId: PREVIEW_RUN_ID, customers: inputs.customers, filter: input.audience, template: input.messageTemplate,
    store: { storeName: store.storeName },
    rules: { quietHoursStart: settings.quietHoursStart, quietHoursEnd: settings.quietHoursEnd, optOutLine: settings.optOutLine },
    suppressedPhones: inputs.suppressedPhones, recentlyTextedPhones: inputs.recentlyTextedPhones,
    dueAt: now, now, expiryMs: DEFAULT_EXPIRY_MS,
  })
  const reach = plan.rows.length
  const outlook = await readOutlook(db, tenantId, settings, now)
  const finish = estimateDeliveryFinish({ waiting: outlook.waiting + reach, sentToday: outlook.sentToday, now, rules: settings })
  const segmentsPerGuest = plan.maxSegments || estimateCampaignSegments(input.messageTemplate, settings.optOutLine)
  const sampleBody = renderCampaignMessage(input.messageTemplate, SAMPLE_GUEST, { storeName: store.storeName }, { optOutLine: settings.optOutLine })
  return {
    reach,
    skipped: nonZero({ ...plan.summary, ...ineligible }),
    samples: plan.samples.length > 0 ? plan.samples : sampleBody ? [{ label: 'Sample guest', body: sampleBody }] : [],
    segmentsPerGuest,
    textsUsed: reach * segmentsPerGuest,
    finishAt: reach > 0 && finish ? finish.toISOString() : null,
    waitingAhead: outlook.waiting,
    daysToFinish: reach > 0 ? daysUntil(finish, now, outlook.waiting + reach + outlook.sentToday, settings.dailyLimit) : 0,
    dailyLimit: settings.dailyLimit,
  }
}
