/**
 * Shared pieces of the campaign writers: loading a campaign with its runs,
 * the row a draft becomes, the "may this go live" check, and withdrawing a
 * campaign's waiting texts. Server-only (service role).
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Outcome } from '@/lib/sms-automations/api/writes'
import type { AutomationSettings } from '@/lib/sms-automations/types'
import { campaignDraftInputSchema, checkScheduleTiming } from '../campaign-schema'
import type { CampaignRecord } from '../campaign-view'
import { MAX_CAMPAIGN_SEGMENTS, estimateCampaignSegments } from '../message'
import type { CampaignDraftInput, CampaignSchedule } from '../types'
import { readCampaign } from './campaign-run'
import { isOpenRun, readRunsForCampaigns, withdrawRunTexts, type RunDetail } from './campaign-runs'

export const refuse = <T>(status: number, error: string, code: string): Outcome<T> => ({ ok: false, status, error, code })
export const done = <T>(value: T): Outcome<T> => ({ ok: true, value })

export const NOT_FOUND = 'That campaign no longer exists.'
export const TOO_LONG = 'Too long: keep it to 3 texts or less.'

export interface CampaignState {
  campaign: CampaignRecord
  runs: RunDetail[]
  openRuns: RunDetail[]
}

export async function loadCampaignState(db: SupabaseClient, tenantId: string, campaignId: string): Promise<CampaignState | null> {
  const campaign = await readCampaign(db, tenantId, campaignId)
  if (!campaign) return null
  const runs = await readRunsForCampaigns(db, tenantId, [campaignId])
  return { campaign, runs, openRuns: runs.filter((run) => run.delivery === 'server' && isOpenRun(run)) }
}

/** The editable columns of a campaign row; only the field the schedule kind uses is kept. */
export function rowFieldsOf(input: CampaignDraftInput, settings: AutomationSettings): Record<string, unknown> {
  const { schedule } = input
  return {
    name: input.name.trim(),
    message_template: input.messageTemplate,
    audience: input.audience,
    schedule_kind: schedule.kind,
    schedule_time: schedule.time,
    schedule_date: schedule.kind === 'one_off' ? schedule.date : null,
    schedule_interval_days: schedule.kind === 'every_n_days' ? schedule.intervalDays : null,
    schedule_weekdays: schedule.kind === 'weekly' ? [...new Set(schedule.weekdays)].sort((a, b) => a - b) : [],
    ends_on: schedule.kind === 'one_off' ? null : schedule.endsOn,
    ...quietColumns(settings),
  }
}

/** One source of truth: the store window, mirrored so the app shows the same hours. */
export function quietColumns(settings: AutomationSettings): Record<string, string> {
  return { quiet_hours_start: settings.quietHoursStart, quiet_hours_end: settings.quietHoursEnd }
}

export function draftOf(campaign: CampaignRecord): CampaignDraftInput {
  return { name: campaign.name, messageTemplate: campaign.messageTemplate, audience: campaign.audience, schedule: campaign.schedule }
}

/** Why this draft cannot be saved (schema + text count), or null. */
export function draftProblem(input: unknown, settings: AutomationSettings): string | null {
  const parsed = campaignDraftInputSchema.safeParse(input)
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Check the campaign and try again.'
  return estimateCampaignSegments(parsed.data.messageTemplate, settings.optOutLine) > MAX_CAMPAIGN_SEGMENTS ? TOO_LONG : null
}

/** Why this campaign cannot go live at `now`, or null. `checkTiming: false` for Send now. */
export function liveProblem(campaign: CampaignRecord, settings: AutomationSettings, now: Date, checkTiming = true): string | null {
  return draftProblem(draftOf(campaign), settings) ?? (checkTiming ? timingProblem(campaign.schedule, settings, now) : null)
}

/** checkScheduleTiming against the store's own quiet hours. */
export function timingProblem(schedule: CampaignSchedule, settings: AutomationSettings, now: Date): string | null {
  return checkScheduleTiming(schedule, now, { start: settings.quietHoursStart, end: settings.quietHoursEnd })
}

/** Withdraw the open server runs' waiting texts (pause/archive/Owl). Returns how many. */
export const cancelCampaignWaiting = withdrawRunTexts

/** Ids of a campaign's open server runs. */
export async function openServerRunIds(db: SupabaseClient, tenantId: string, campaignId: string): Promise<string[]> {
  const { data, error } = await db.from('sms_campaign_runs').select('id')
    .eq('tenant_id', tenantId).eq('campaign_id', campaignId).eq('delivery', 'server').in('status', ['pending', 'running'])
  if (error) throw new Error(`campaign runs could not be read: ${error.message}`)
  return ((data ?? []) as { id: string }[]).map((row) => row.id)
}

/** Conditional update that must hit exactly one row; false = it changed underneath us. */
export async function updateOne(
  db: SupabaseClient, tenantId: string, campaignId: string, fields: Record<string, unknown>, fromStatuses: readonly string[],
): Promise<boolean> {
  const { data, error } = await db.from('sms_campaigns').update(fields)
    .eq('tenant_id', tenantId).eq('id', campaignId).in('status', [...fromStatuses]).select('id')
  if (error) throw new Error(`campaign could not be saved: ${error.message}`)
  return (data ?? []).length === 1
}

export const CHANGED = 'This campaign changed in the meantime. Refresh and try again.'
