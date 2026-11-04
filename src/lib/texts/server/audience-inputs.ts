/**
 * Everything a campaign run or preview reads about one store, with the
 * service role. Server-only.
 *
 * Every read is tenant-scoped, ordered by a unique key and paged past the
 * 1000-row cap. "Who can never be texted" (no phone / no consent / opted out)
 * is counted with head-only queries: a preview never downloads guests it
 * cannot text, and a run never needs them.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOrderBackend, type OrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { readSettings } from '@/lib/sms-automations/api/reads'
import { guestFromCustomerRow, type CustomerRow } from '@/lib/sms-automations/rows'
import type { AutomationSettings } from '@/lib/sms-automations/types'
import type { SmsCustomer } from '../audience'
import { PAGE_SIZE, readAll } from './paged'

const DAY_MS = 86_400_000
/** A phone silent this long is offline (same threshold as phone-health's "offline"). */
export const PHONE_READY_WITHIN_MS = 30 * 60_000

const GUEST_COLUMNS =
  'id, name, phone_e164, sms_consent, sms_opt_out, order_count, total_spent, first_order_at, last_order_at, top_items, channels_used'
const TENANT_COLUMNS =
  'id, name, order_backend, convex_deployment_url, supabase_order_url, supabase_order_anon_key'

export class TextsReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TextsReadError'
  }
}

const fail = (message: string) => new TextsReadError(message)

export interface StoreFacts {
  storeName: string
  orderBackend: OrderBackend
}

export async function readStoreFacts(db: SupabaseClient, tenantId: string): Promise<StoreFacts> {
  const { data, error } = await db.from('tenants').select(TENANT_COLUMNS).eq('id', tenantId).maybeSingle()
  if (error) throw fail(`store could not be read: ${error.message}`)
  if (!data) throw fail('store not found')
  const tenant = data as unknown as OrderBackendTenantFields & { name: string }
  return { storeName: tenant.name, orderBackend: resolveOrderBackend(tenant) }
}

type GuestRow = CustomerRow & { channels_used: unknown }

function toSmsCustomer(row: GuestRow): SmsCustomer {
  const profile = guestFromCustomerRow(row)
  return {
    id: profile.id,
    name: profile.name,
    phone_e164: profile.phone,
    order_count: profile.orderCount,
    total_spent: profile.totalSpent,
    last_order_at: profile.lastOrderAt,
    channels_used: Array.isArray(row.channels_used) ? row.channels_used.filter((c): c is string => typeof c === 'string') : [],
    sms_consent: profile.smsConsent,
    sms_opt_out: profile.smsOptOut,
  }
}

/** A store with more textable guests than this is refused loudly rather than timing out a shared request. */
const MAX_GUESTS = 50_000

/**
 * Guests who may be texted at all: a phone, consent, not opted out. Keyset
 * pages on id (`id > last`), served by the partial index
 * customers(tenant_id, id) where textable — no OFFSET scans on big stores.
 */
export async function readTextableGuests(db: SupabaseClient, tenantId: string): Promise<SmsCustomer[]> {
  const rows: GuestRow[] = []
  let lastId: string | null = null
  for (;;) {
    const base = db.from('customers').select(GUEST_COLUMNS)
      .eq('tenant_id', tenantId).not('phone_e164', 'is', null).eq('sms_consent', true).eq('sms_opt_out', false)
    const { data, error } = await (lastId ? base.gt('id', lastId) : base).order('id').limit(PAGE_SIZE)
    if (error) throw fail(`guests could not be read: ${error.message}`)
    const page = (data ?? []) as unknown as GuestRow[]
    rows.push(...page)
    if (rows.length > MAX_GUESTS) throw fail(`guests: more than ${MAX_GUESTS} who can be texted`)
    if (page.length < PAGE_SIZE) return rows.map(toSmsCustomer)
    lastId = page[page.length - 1].id
  }
}

export interface IneligibleCounts {
  no_phone: number
  no_consent: number
  opted_out: number
}

/** Head counts in the audience veto order (a guest is counted once, under the first reason). */
export async function countIneligible(db: SupabaseClient, tenantId: string): Promise<IneligibleCounts> {
  const head = () => db.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
  const [noPhone, noConsent, optedOut] = await Promise.all([
    head().is('phone_e164', null),
    head().not('phone_e164', 'is', null).not('sms_consent', 'is', true),
    head().not('phone_e164', 'is', null).eq('sms_consent', true).eq('sms_opt_out', true),
  ])
  const error = noPhone.error ?? noConsent.error ?? optedOut.error
  if (error) throw fail(`guest counts could not be read: ${error.message}`)
  return { no_phone: noPhone.count ?? 0, no_consent: noConsent.count ?? 0, opted_out: optedOut.count ?? 0 }
}

export async function readSuppressedPhones(db: SupabaseClient, tenantId: string): Promise<string[]> {
  const rows = await readAll<{ phone_e164: string }>('blocked numbers', (from, to) =>
    db.from('sms_suppressions').select('phone_e164').eq('tenant_id', tenantId).order('id').range(from, to), { makeError: fail })
  return rows.map((row) => row.phone_e164)
}

/**
 * Phones inside the per-guest cap: any text still waiting or in a phone's
 * hands, one sent (or dispatched without confirmation) in the last
 * `guestCapDays`, and campaign texts the phone sent itself (`sms_sends`).
 * Rows of `excludeRunId` are ignored so a re-plan of the same run does not
 * count its own guests as "texted recently".
 */
export async function readRecentlyTextedPhones(
  db: SupabaseClient, tenantId: string, capDays: number, now: Date, excludeRunId: string | null = null,
): Promise<string[]> {
  const since = new Date(now.getTime() - capDays * DAY_MS).toISOString()
  const [outbox, sends] = await Promise.all([
    readAll<{ phone_e164: string; campaign_run_id: string | null }>('recent texts', (from, to) => db.from('sms_outbox')
      .select('phone_e164, campaign_run_id').eq('tenant_id', tenantId).neq('source', 'test')
      .or(`status.in.(queued,claimed),and(status.eq.sent,sent_at.gte.${since}),and(status.eq.failed,error.eq.unconfirmed,dispatch_started_at.gte.${since})`)
      .order('id').range(from, to), { makeError: fail }),
    readAll<{ phone_e164: string }>('recent campaign sends', (from, to) => db.from('sms_sends')
      .select('phone_e164').eq('tenant_id', tenantId).eq('result', 'sent').gte('sent_at', since)
      .order('id').range(from, to), { makeError: fail }),
  ])
  const phones = [
    ...outbox.filter((row) => !excludeRunId || row.campaign_run_id !== excludeRunId).map((row) => row.phone_e164),
    ...sends.map((row) => row.phone_e164),
  ]
  return [...new Set(phones)]
}

export interface PhoneReadiness {
  enabledPhones: number
  lastSeenAt: string | null
  /** An enabled phone checked in within PHONE_READY_WITHIN_MS. */
  isReady: boolean
}

export async function readPhoneReadiness(db: SupabaseClient, tenantId: string, now: Date): Promise<PhoneReadiness> {
  const [devices, heartbeat] = await Promise.all([
    db.from('loyalty_sms_devices').select('device_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('enabled', true),
    db.from('loyalty_sms_device_heartbeats').select('last_seen_at').eq('tenant_id', tenantId)
      .order('last_seen_at', { ascending: false }).limit(1),
  ])
  if (devices.error) throw fail(`sending phones could not be read: ${devices.error.message}`)
  if (heartbeat.error) throw fail(`phone check-ins could not be read: ${heartbeat.error.message}`)
  const enabledPhones = devices.count ?? 0
  const lastSeenAt = ((heartbeat.data ?? []) as { last_seen_at: string }[])[0]?.last_seen_at ?? null
  const isFresh = lastSeenAt !== null && now.getTime() - Date.parse(lastSeenAt) <= PHONE_READY_WITHIN_MS
  return { enabledPhones, lastSeenAt, isReady: enabledPhones > 0 && isFresh }
}

export interface AudienceInputs {
  store: StoreFacts
  settings: AutomationSettings
  customers: SmsCustomer[]
  suppressedPhones: string[]
  recentlyTextedPhones: string[]
}

/** One store's textable guests + the rules and block lists a run or preview applies. */
export async function loadAudienceInputs(
  db: SupabaseClient, tenantId: string, now: Date, options: { excludeRunId?: string | null } = {},
): Promise<AudienceInputs> {
  const settings = await readSettings(db, tenantId)
  const [store, customers, suppressedPhones, recentlyTextedPhones] = await Promise.all([
    readStoreFacts(db, tenantId),
    readTextableGuests(db, tenantId),
    readSuppressedPhones(db, tenantId),
    readRecentlyTextedPhones(db, tenantId, settings.guestCapDays, now, options.excludeRunId ?? null),
  ])
  return { store, settings, customers, suppressedPhones, recentlyTextedPhones }
}
