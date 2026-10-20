/**
 * One campaign run: from guests to `sms_outbox` rows. Pure.
 *
 * Unlike the phone path (a capped batch per poll, the rest on the next poll),
 * the server queues EVERYONE eligible up to `SERVER_RUN_CEILING` at once, and
 * lets the claim's pacing (25 per 30 min), the daily limit and each row's
 * expiry spread them out. Warmest guests first: each row's `not_before` is
 * nudged by its rank, because the claim orders by (priority, not_before).
 *
 * Every row carries `occurrence_key = 'run:<runId>'`. The outbox's unique
 * (tenant, family, customer, occurrence_key) then makes a re-plan of the same
 * run a no-op per guest — the crash-recovery path relies on it — while two
 * campaigns due at the same instant never collide.
 */

import { maskGuestName } from '@/lib/sms-automations/planner'
import { nextSendableAt } from '@/lib/sms-automations/quiet-hours'
import { countSmsSegments } from '@/lib/sms-automations/template'
import { selectAudience, type SmsCustomer } from './audience'
import { renderCampaignMessage, type CampaignStore } from './message'
import type { AudienceFilter, SkippedReason } from './types'

export const SERVER_RUN_CEILING = 500
/** Automations use 1..7: a reward-expiring text never queues behind a promo. */
export const CAMPAIGN_PRIORITY = 20
export const CAMPAIGN_RECIPE = 'campaign'
const SAMPLE_SIZE = 5
const RANK_STEP_MS = 1000

export const SKIPPED_REASONS: readonly SkippedReason[] = [
  'no_phone', 'no_consent', 'opted_out', 'suppressed', 'recently_texted', 'cannot_fill', 'over_ceiling',
]

/** One `sms_outbox` row a campaign run inserts. */
export interface CampaignOutboxRow {
  tenant_id: string
  automation_id: null
  recipe: typeof CAMPAIGN_RECIPE
  family: typeof CAMPAIGN_RECIPE
  source: typeof CAMPAIGN_RECIPE
  campaign_run_id: string
  customer_id: string
  phone_e164: string
  body: string
  occurrence_key: string
  priority: number
  not_before: string
  expires_at: string
  exit_if_ordered_after: null
  entitlement_id: null
}

export interface CampaignRunRules {
  quietHoursStart: string
  quietHoursEnd: string
  optOutLine: string | null
}

export interface CampaignRunPlanInput {
  tenantId: string
  runId: string
  customers: readonly SmsCustomer[]
  filter: AudienceFilter
  template: string
  store: CampaignStore
  rules: CampaignRunRules
  suppressedPhones: readonly string[]
  recentlyTextedPhones: readonly string[]
  /** The occurrence's due moment; a late plan starts now. */
  dueAt: Date
  now: Date
  expiryMs: number
  ceiling?: number
}

export interface CampaignRunPlan {
  rows: CampaignOutboxRow[]
  summary: Record<SkippedReason, number>
  /** Eligible guests who simply did not match the filter (not a "skip"). */
  filteredOut: number
  samples: Array<{ label: string; body: string }>
  /** Texts per guest for the longest rendered message (0 when nobody). */
  maxSegments: number
}

export function occurrenceKeyFor(runId: string): string {
  return `run:${runId}`
}

function emptySummary(): Record<SkippedReason, number> {
  return SKIPPED_REASONS.reduce((acc, reason) => ({ ...acc, [reason]: 0 }), {} as Record<SkippedReason, number>)
}

interface Rendered {
  guest: SmsCustomer
  body: string
}

function renderAll(input: CampaignRunPlanInput, recipients: readonly SmsCustomer[]): { rendered: Rendered[]; cannotFill: number } {
  const rendered: Rendered[] = []
  for (const guest of recipients) {
    const body = renderCampaignMessage(input.template, guest, input.store, { optOutLine: input.rules.optOutLine })
    if (body !== null) rendered.push({ guest, body })
  }
  return { rendered, cannotFill: recipients.length - rendered.length }
}

/** Keep the first (most recent order) guest per phone number; `rendered` is already sorted by recency. */
function onePerPhone(rendered: readonly Rendered[]): Rendered[] {
  const seen = new Set<string>()
  return rendered.filter(({ guest }) => {
    const phone = guest.phone_e164 as string
    if (seen.has(phone)) return false
    seen.add(phone)
    return true
  })
}

function toRow(input: CampaignRunPlanInput, item: Rendered, startMs: number, rank: number): CampaignOutboxRow {
  const notBefore = startMs + rank * RANK_STEP_MS
  return {
    tenant_id: input.tenantId,
    automation_id: null,
    recipe: CAMPAIGN_RECIPE,
    family: CAMPAIGN_RECIPE,
    source: CAMPAIGN_RECIPE,
    campaign_run_id: input.runId,
    customer_id: item.guest.id,
    phone_e164: item.guest.phone_e164 as string,
    body: item.body,
    occurrence_key: occurrenceKeyFor(input.runId),
    priority: CAMPAIGN_PRIORITY,
    not_before: new Date(notBefore).toISOString(),
    expires_at: new Date(notBefore + input.expiryMs).toISOString(),
    exit_if_ordered_after: null,
    entitlement_id: null,
  }
}

export function planCampaignRun(input: CampaignRunPlanInput): CampaignRunPlan {
  const audience = selectAudience(input.customers, input.filter, {
    now: input.now, suppressedPhones: input.suppressedPhones, recentlyTextedPhones: input.recentlyTextedPhones,
  })
  const { rendered, cannotFill } = renderAll(input, audience.recipients)
  const unique = onePerPhone(rendered)
  const ceiling = input.ceiling ?? SERVER_RUN_CEILING
  const chosen = unique.slice(0, ceiling)
  const start = input.dueAt.getTime() > input.now.getTime() ? input.dueAt : input.now
  const startMs = nextSendableAt(start, input.rules.quietHoursStart, input.rules.quietHoursEnd).getTime()
  const { filter: filteredOut, ...vetoes } = audience.summary
  return {
    rows: chosen.map((item, rank) => toRow(input, item, startMs, rank)),
    summary: {
      ...emptySummary(), ...vetoes, cannot_fill: cannotFill,
      // A second guest row with the same number would get the same promo twice: it counts as texted.
      recently_texted: vetoes.recently_texted + (rendered.length - unique.length),
      over_ceiling: unique.length - chosen.length,
    },
    filteredOut,
    samples: chosen.slice(0, SAMPLE_SIZE).map((item) => ({ label: maskGuestName(item.guest.name), body: item.body })),
    maxSegments: chosen.reduce((max, item) => Math.max(max, countSmsSegments(item.body).segments), 0),
  }
}
