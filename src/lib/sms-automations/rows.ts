/**
 * Database rows → engine shapes. Pure.
 *
 * The rows come from tables other features write (customers.top_items,
 * loyalty reward terms, an automation's params jsonb), so every mapper
 * tolerates junk: one malformed guest must never stop a whole store's texts.
 */

import { isRecipeId } from './recipes'
import {
  AUTOMATION_SOURCES, AUTOMATION_STATUSES, RUN_MODES,
  type AutomationParams, type AutomationRow, type AutomationSettings, type GuestProfile,
} from './types'
import type { EntitlementRow } from './candidates'
import type { LoyaltyReward } from '@/lib/loyalty/types'

/** Mirrors the column defaults of `sms_settings` (20261013120000_sms_automations.sql). */
export const DEFAULT_SETTINGS: AutomationSettings = Object.freeze({
  quietHoursStart: '21:00',
  quietHoursEnd: '08:00',
  guestCapDays: 3,
  dailyLimit: 100,
  optOutLine: null,
  reviewUrl: null,
})

export interface SettingsRow {
  quiet_hours_start: string
  quiet_hours_end: string
  guest_cap_days: number
  daily_limit: number
  opt_out_line: string | null
  review_url: string | null
}

export function settingsFromRow(row: SettingsRow | null): AutomationSettings {
  if (!row) return { ...DEFAULT_SETTINGS }
  return {
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    guestCapDays: row.guest_cap_days,
    dailyLimit: row.daily_limit,
    optOutLine: row.opt_out_line,
    reviewUrl: row.review_url,
  }
}

export const CUSTOMER_COLUMNS =
  'id, name, phone_e164, sms_consent, sms_opt_out, order_count, total_spent, first_order_at, last_order_at, top_items'

export interface CustomerRow {
  id: string
  name: string | null
  phone_e164: string | null
  sms_consent: boolean | null
  sms_opt_out: boolean | null
  order_count: unknown
  total_spent: unknown
  first_order_at: string | null
  last_order_at: string | null
  top_items: unknown
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

/** The item the guest ordered most, from `customers.top_items` ([{ name, quantity }]). */
function favoriteOf(topItems: unknown): string | null {
  if (!Array.isArray(topItems)) return null
  let best: { name: string; quantity: number } | null = null
  for (const item of topItems) {
    if (!item || typeof item !== 'object') continue
    const { name, quantity } = item as { name?: unknown; quantity?: unknown }
    if (typeof name !== 'string' || name.trim() === '') continue
    const count = toNumber(quantity)
    if (!best || count > best.quantity) best = { name: name.trim(), quantity: count }
  }
  return best?.name ?? null
}

export function guestFromCustomerRow(row: CustomerRow): GuestProfile {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone_e164,
    smsConsent: row.sms_consent === true,
    smsOptOut: row.sms_opt_out === true,
    orderCount: Math.max(0, Math.trunc(toNumber(row.order_count))),
    totalSpent: toNumber(row.total_spent),
    firstOrderAt: row.first_order_at,
    lastOrderAt: row.last_order_at,
    favoriteItem: favoriteOf(row.top_items),
  }
}

export const AUTOMATION_COLUMNS =
  'id, tenant_id, recipe, name, params, message_template, run_mode, reentry_days, status, source, created_at, updated_at'

const PARAM_KEYS: readonly (keyof AutomationParams)[] = [
  'delayHours', 'delayDays', 'inactiveDays', 'remainingAtMost', 'minOrderCount',
]

/** Only finite numbers under known keys; `clampParams` keeps them in range. */
export function paramsFromJson(raw: unknown): AutomationParams {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const source = raw as Record<string, unknown>
  return PARAM_KEYS.reduce<AutomationParams>((params, key) => {
    const value = source[key]
    return typeof value === 'number' && Number.isFinite(value) ? { ...params, [key]: value } : params
  }, {})
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

/** Null for a row this engine version cannot run (it is reported, not guessed at). */
export function automationFromRow(row: Record<string, unknown>): AutomationRow | null {
  if (!isRecipeId(row.recipe) || !isOneOf(RUN_MODES, row.run_mode)
    || !isOneOf(AUTOMATION_STATUSES, row.status) || !isOneOf(AUTOMATION_SOURCES, row.source)) return null
  if (typeof row.id !== 'string' || typeof row.tenant_id !== 'string' || typeof row.message_template !== 'string') return null
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    recipe: row.recipe,
    name: typeof row.name === 'string' ? row.name : row.recipe,
    params: paramsFromJson(row.params),
    message_template: row.message_template,
    run_mode: row.run_mode,
    reentry_days: typeof row.reentry_days === 'number' ? row.reentry_days : null,
    status: row.status,
    source: row.source,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

const REWARD_TYPES = new Set(['fixed', 'percent', 'free_item'])

export interface EntitlementDbRow {
  id: string
  customer_key: string
  issued_at: string
  expires_at: string | null
  terms: unknown
}

export function entitlementFromRow(row: EntitlementDbRow): EntitlementRow | null {
  const terms = row.terms as { reward?: unknown } | null
  const reward = terms?.reward as { type?: unknown } | undefined
  if (!reward || typeof reward !== 'object' || !REWARD_TYPES.has(String(reward.type))) return null
  return {
    id: row.id,
    customerKey: row.customer_key,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    terms: { reward: reward as LoyaltyReward },
  }
}
