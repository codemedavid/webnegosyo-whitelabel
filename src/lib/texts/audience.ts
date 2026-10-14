/**
 * Who a campaign texts. Pure.
 *
 * A behaviour-identical port of the merchant app's selection
 * (webnegosyo-app/lib/sms/audience.ts) so a campaign reaches the same guests
 * whether a phone or the server runs it; `tests/unit/texts/audience.test.ts`
 * runs both over the same guests. Every eligibility check is a veto and runs
 * BEFORE the owner's filter, so the reason shown is the one the owner must not
 * override ("opted out", not "didn't match").
 */

import type { AudienceFilter, AudiencePreset } from './types'

/** A guest as `public.customers` hands them over, narrowed to what a campaign needs. */
export interface SmsCustomer {
  id: string
  name: string | null
  phone_e164: string | null
  order_count: number
  total_spent: number
  last_order_at: string | null
  channels_used: string[]
  sms_consent: boolean
  sms_opt_out: boolean
}

export type ExclusionReason = 'no_phone' | 'no_consent' | 'opted_out' | 'suppressed' | 'recently_texted' | 'filter'

export interface AudienceExclusion {
  customerId: string
  reason: ExclusionReason
}

export interface AudienceContext {
  now: string | Date
  suppressedPhones?: readonly string[]
  recentlyTextedPhones?: readonly string[]
}

export interface AudienceResult {
  recipients: SmsCustomer[]
  excluded: AudienceExclusion[]
  /** Counts per reason; always has every key. */
  summary: Record<ExclusionReason, number>
}

const MS_PER_DAY = 86_400_000
const ALL_REASONS: readonly ExclusionReason[] = ['no_phone', 'no_consent', 'opted_out', 'suppressed', 'recently_texted', 'filter']

function eligibilityVeto(customer: SmsCustomer, suppressed: ReadonlySet<string>, recent: ReadonlySet<string>): ExclusionReason | null {
  if (!customer.phone_e164) return 'no_phone'
  if (!customer.sms_consent) return 'no_consent'
  if (customer.sms_opt_out) return 'opted_out'
  if (suppressed.has(customer.phone_e164)) return 'suppressed'
  if (recent.has(customer.phone_e164)) return 'recently_texted'
  return null
}

function daysSinceLastOrder(customer: SmsCustomer, now: number): number | null {
  if (!customer.last_order_at) return null
  const lastOrder = new Date(customer.last_order_at).getTime()
  return Number.isFinite(lastOrder) ? (now - lastOrder) / MS_PER_DAY : null
}

/** A guest who never ordered sits outside BOTH recency windows (never "lapsed", never "recent"). */
export function matchesFilter(customer: SmsCustomer, filter: AudienceFilter, now: number): boolean {
  const elapsed = daysSinceLastOrder(customer, now)
  if (filter.lastOrderOlderThanDays !== undefined && (elapsed === null || elapsed <= filter.lastOrderOlderThanDays)) return false
  if (filter.lastOrderWithinDays !== undefined && (elapsed === null || elapsed > filter.lastOrderWithinDays)) return false
  if (filter.minOrderCount !== undefined && customer.order_count < filter.minOrderCount) return false
  if (filter.maxOrderCount !== undefined && customer.order_count > filter.maxOrderCount) return false
  if (filter.minTotalSpent !== undefined && customer.total_spent < filter.minTotalSpent) return false
  if (filter.channels !== undefined && filter.channels.length > 0) {
    const used = customer.channels_used ?? []
    if (!filter.channels.some((channel) => used.includes(channel))) return false
  }
  return true
}

function byRecencyDesc(a: SmsCustomer, b: SmsCustomer): number {
  const aTime = a.last_order_at ? new Date(a.last_order_at).getTime() : 0
  const bTime = b.last_order_at ? new Date(b.last_order_at).getTime() : 0
  return bTime - aTime
}

export function selectAudience(customers: readonly SmsCustomer[], filter: AudienceFilter, context: AudienceContext): AudienceResult {
  const now = new Date(context.now).getTime()
  const suppressed = new Set(context.suppressedPhones ?? [])
  const recent = new Set(context.recentlyTextedPhones ?? [])
  const excluded: AudienceExclusion[] = []
  const recipients: SmsCustomer[] = []
  for (const customer of customers) {
    const veto = eligibilityVeto(customer, suppressed, recent) ?? (matchesFilter(customer, filter, now) ? null : 'filter')
    if (veto) excluded.push({ customerId: customer.id, reason: veto })
    else recipients.push(customer)
  }
  const summary = ALL_REASONS.reduce(
    (counts, reason) => ({ ...counts, [reason]: excluded.filter((entry) => entry.reason === reason).length }),
    {} as Record<ExclusionReason, number>,
  )
  return { recipients: [...recipients].sort(byRecencyDesc), excluded, summary }
}

// ─── Presets (the composer's chips; mirror the app wizard's AUDIENCE_SEGMENTS) ─

type NamedPreset = Exclude<AudiencePreset, 'custom'>

const LAPSED_DAYS = 21
const REGULAR_MIN_ORDERS = 3
const RECENT_DAYS = 30

export const AUDIENCE_PRESET_FILTERS: Readonly<Record<NamedPreset, AudienceFilter>> = Object.freeze({
  everyone: {},
  lapsed: { lastOrderOlderThanDays: LAPSED_DAYS },
  regulars: { minOrderCount: REGULAR_MIN_ORDERS },
  first_timers: { minOrderCount: 1, maxOrderCount: 1 },
  recent: { lastOrderWithinDays: RECENT_DAYS },
})

const PRESET_LABELS: Readonly<Record<AudiencePreset, string>> = Object.freeze({
  everyone: 'Everyone',
  lapsed: "Haven't been back",
  regulars: 'Regulars',
  first_timers: 'First-timers',
  recent: 'Recent guests',
  custom: 'Custom',
})

const MANAGED_KEYS = ['lastOrderOlderThanDays', 'lastOrderWithinDays', 'minOrderCount', 'maxOrderCount'] as const

/** Which chip a stored filter is; anything the chips cannot show (spend, channels) is "custom". */
export function matchAudiencePreset(filter: AudienceFilter): AudiencePreset {
  if (filter.minTotalSpent !== undefined || (filter.channels !== undefined && filter.channels.length > 0)) return 'custom'
  const match = (Object.keys(AUDIENCE_PRESET_FILTERS) as NamedPreset[])
    .find((id) => MANAGED_KEYS.every((key) => filter[key] === AUDIENCE_PRESET_FILTERS[id][key]))
  return match ?? 'custom'
}

export function audienceLabelOf(preset: AudiencePreset): string {
  return PRESET_LABELS[preset]
}
