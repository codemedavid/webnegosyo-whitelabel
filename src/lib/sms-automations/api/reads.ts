/**
 * Read side of the automations API: the screen's list (automations + recipes
 * + rules + sender), the activity feed, and the delivery outlook (what is
 * waiting, what went out today, when the queue will be empty). Server-only.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readGatewayStatus } from '@/lib/loyalty/otp-delivery'
import { estimateDeliveryFinish } from '../eta'
import { RECIPES, describeAutomation } from '../recipes'
import { settingsFromRow, type SettingsRow } from '../rows'
import { readAutomations } from '../server/snapshot'
import { allowedVariables } from '../template'
import type { AutomationSettings, OutboxStatus } from '../types'

const DAY_MS = 86_400_000
const STATS_DAYS = 30
const PAGE_SIZE = 1000
const MAX_STATS_ROWS = 20_000
const DEFAULT_ACTIVITY_PAGE = 50

export class ReadError extends Error {}

export async function readSettings(db: SupabaseClient, tenantId: string): Promise<AutomationSettings> {
  const { data, error } = await db.from('sms_settings')
    .select('quiet_hours_start, quiet_hours_end, guest_cap_days, daily_limit, opt_out_line, review_url')
    .eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new ReadError(`texting rules: ${error.message}`)
  return settingsFromRow(data as SettingsRow | null)
}

export interface SenderStatus {
  /** Phones enrolled to send for this store. */
  enrolled: number
  online: boolean
  lastSeenAt: string | null
}

export async function readSender(db: SupabaseClient, tenantId: string): Promise<SenderStatus> {
  const [{ count, error }, gateway] = await Promise.all([
    db.from('loyalty_sms_devices').select('device_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('enabled', true),
    readGatewayStatus(db, tenantId),
  ])
  if (error) throw new ReadError(`sender phones: ${error.message}`)
  return { enrolled: count ?? 0, online: gateway?.gatewayOnline ?? false, lastSeenAt: gateway?.lastSeenAt ?? null }
}

function manilaMidnight(now: Date): Date {
  const offset = 8 * 3_600_000
  return new Date(Math.floor((now.getTime() + offset) / DAY_MS) * DAY_MS - offset)
}

export interface DeliveryOutlook {
  waiting: number
  sentToday: number
  dailyLimit: number
  /** When the last waiting text should be out, assuming the phone stays on; null = more than two weeks. */
  finishAt: string | null
}

export async function readOutlook(
  db: SupabaseClient, tenantId: string, settings: AutomationSettings, now = new Date(),
): Promise<DeliveryOutlook> {
  const [waiting, sentToday] = await Promise.all([
    db.from('sms_outbox').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'queued').gt('expires_at', now.toISOString()),
    db.from('sms_outbox').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('dispatch_started_at', manilaMidnight(now).toISOString()),
  ])
  if (waiting.error || sentToday.error) throw new ReadError('delivery outlook could not be read')
  const finish = estimateDeliveryFinish({ waiting: waiting.count ?? 0, sentToday: sentToday.count ?? 0, now, rules: settings })
  return {
    waiting: waiting.count ?? 0,
    sentToday: sentToday.count ?? 0,
    dailyLimit: settings.dailyLimit,
    finishAt: finish ? finish.toISOString() : null,
  }
}

export interface AutomationStats {
  waiting: number
  sent30d: number
  skipped30d: number
  /** Guests texted in the last 30 days who have ordered since the text. */
  cameBack30d: number
  lastSentAt: string | null
}

const EMPTY_STATS: AutomationStats = { waiting: 0, sent30d: 0, skipped30d: 0, cameBack30d: 0, lastSentAt: null }

async function readStats(db: SupabaseClient, tenantId: string, now: Date): Promise<Map<string, AutomationStats>> {
  const since = new Date(now.getTime() - STATS_DAYS * DAY_MS).toISOString()
  const stats = new Map<string, AutomationStats>()
  for (let from = 0; from < MAX_STATS_ROWS; from += PAGE_SIZE) {
    const { data, error } = await db.from('sms_outbox').select('automation_id, status, sent_at, customers(last_order_at)')
      .eq('tenant_id', tenantId).not('automation_id', 'is', null).gte('created_at', since)
      .order('id').range(from, from + PAGE_SIZE - 1)
    if (error) throw new ReadError(`automation results: ${error.message}`)
    type Row = { automation_id: string; status: OutboxStatus; sent_at: string | null; customers: { last_order_at: string | null } | null }
    for (const row of (data ?? []) as unknown as Row[]) {
      const entry = stats.get(row.automation_id) ?? EMPTY_STATS
      const lastOrder = row.customers?.last_order_at ?? null
      const cameBack = row.status === 'sent' && row.sent_at !== null && lastOrder !== null && Date.parse(lastOrder) > Date.parse(row.sent_at)
      const next = {
        waiting: entry.waiting + (row.status === 'queued' || row.status === 'claimed' ? 1 : 0),
        sent30d: entry.sent30d + (row.status === 'sent' ? 1 : 0),
        skipped30d: entry.skipped30d + (row.status === 'skipped' || row.status === 'cancelled' ? 1 : 0),
        cameBack30d: entry.cameBack30d + (cameBack ? 1 : 0),
        lastSentAt: row.sent_at && (!entry.lastSentAt || row.sent_at > entry.lastSentAt) ? row.sent_at : entry.lastSentAt,
      }
      stats.set(row.automation_id, next)
    }
    if (!data || data.length < PAGE_SIZE) break
  }
  return stats
}

export async function readLoyaltyOn(db: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await db.from('tenants').select('loyalty_enabled, loyalty_shadow').eq('id', tenantId).maybeSingle()
  if (error) throw new ReadError(`store: ${error.message}`)
  const row = data as { loyalty_enabled: boolean | null; loyalty_shadow: boolean | null } | null
  return row?.loyalty_enabled === true && row.loyalty_shadow !== true
}

/** Everything the Automations screen draws, in one round trip. */
export async function listAutomationsView(db: SupabaseClient, tenantId: string, now = new Date()) {
  const [automations, settings, sender, stats, loyaltyOn] = await Promise.all([
    readAutomations(db, tenantId),
    readSettings(db, tenantId),
    readSender(db, tenantId),
    readStats(db, tenantId, now),
    readLoyaltyOn(db, tenantId),
  ])
  const outlook = await readOutlook(db, tenantId, settings, now)
  return {
    automations: automations.map((a) => ({
      id: a.id,
      recipe: a.recipe,
      name: a.name,
      description: describeAutomation(a.recipe, a.params),
      params: a.params,
      messageTemplate: a.message_template,
      runMode: a.run_mode,
      reentryDays: a.reentry_days,
      status: a.status,
      source: a.source,
      updatedAt: a.updated_at,
      stats: stats.get(a.id) ?? EMPTY_STATS,
    })),
    recipes: RECIPES.map((r) => ({
      id: r.id, moment: r.moment, title: r.title, pitch: r.pitch, defaults: r.defaults, limits: r.limits,
      defaultReentryDays: r.defaultReentryDays, needsLoyalty: r.needsLoyalty, needsReviewLink: r.needsReviewLink,
      defaultMessage: r.defaultMessage, defaultMessageTl: r.defaultMessageTl, variables: allowedVariables(r.id),
      description: describeAutomation(r.id, r.defaults),
    })),
    settings,
    sender,
    outlook,
    loyaltyOn,
  }
}

export interface ActivityQuery {
  /** `<created_at>~<id>` of the last row already shown (validated by the schema). */
  cursor?: string
  status?: OutboxStatus
  automationId?: string
  limit?: number
}

/** Newest first, paged by (created_at, id). Phones are shown by their last 4 digits only. */
export async function listActivity(db: SupabaseClient, tenantId: string, query: ActivityQuery) {
  const limit = query.limit ?? DEFAULT_ACTIVITY_PAGE
  let request = db.from('sms_outbox')
    .select('id, automation_id, recipe, phone_e164, body, status, skip_reason, error, source, not_before, created_at, sent_at, customers(name)')
    .eq('tenant_id', tenantId)
  if (query.cursor) {
    const [createdAt, id] = query.cursor.split('~')
    request = request.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.gt.${id})`)
  }
  if (query.status) request = request.eq('status', query.status)
  if (query.automationId) request = request.eq('automation_id', query.automationId)
  const { data, error } = await request.order('created_at', { ascending: false }).order('id').limit(limit + 1)
  if (error) throw new ReadError(`activity: ${error.message}`)
  const rows = (data ?? []) as unknown as {
    id: string; automation_id: string | null; recipe: string; phone_e164: string; body: string; status: OutboxStatus
    skip_reason: string | null; error: string | null; source: string; not_before: string; created_at: string
    sent_at: string | null; customers: { name: string | null } | null
  }[]
  const page = rows.slice(0, limit)
  return {
    items: page.map((row) => ({
      id: row.id,
      automationId: row.automation_id,
      recipe: row.recipe,
      guestName: row.customers?.name ?? null,
      phoneLast4: row.phone_e164.slice(-4),
      body: row.body,
      status: row.status,
      reason: row.skip_reason ?? row.error,
      source: row.source,
      notBefore: row.not_before,
      createdAt: row.created_at,
      sentAt: row.sent_at,
    })),
    nextCursor: rows.length > limit ? `${page[page.length - 1].created_at}~${page[page.length - 1].id}` : null,
  }
}
