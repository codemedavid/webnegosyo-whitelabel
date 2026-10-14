/**
 * Everything the planner needs about ONE store, read once with the service
 * role. Server-only.
 *
 * Every read is tenant-scoped, indexed and paged past PostgREST's 1000-row
 * cap. Order-anchored data (review requests) only exists for stores whose
 * orders live on the platform database; the others fall back to each guest's
 * last visit (see work.ts). Loyalty rows are read only when an automation
 * needs them.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { listStoreAddresses } from '@/lib/qr-print/qr-links'
import { getRootDomain } from '@/lib/tenant-host'
import { loadActiveLoyaltyPrograms } from '@/lib/loyalty/store'
import { readAll as readAllPages, type PageResult } from '@/lib/texts/server/paged'
import type { BalanceRow, OrderRow } from '../candidates'
import { getRecipe } from '../recipes'
import {
  AUTOMATION_COLUMNS, CUSTOMER_COLUMNS, automationFromRow, entitlementFromRow, guestFromCustomerRow, settingsFromRow,
  type CustomerRow, type EntitlementDbRow, type SettingsRow,
} from '../rows'
import type { AutomationRow, AutomationSettings, GuestProfile, HistoryRow, RecipeId, StoreContext } from '../types'
import type { StoreData } from '../work'

/** A store larger than this is read in part, loudly, rather than timing out a shared tick. */
const MAX_ROWS = 50_000
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** Re-entry gaps go up to a year; older history cannot change a decision (the unique key still dedupes). */
const HISTORY_DAYS = 366
/** Mirrors candidates.ts: an almost-there nudge is never older than its wait + 60 days. */
const ALMOST_THERE_LOOKBACK_DAYS = 14 + 60
const REVIEW_VALID_HOURS = 24
const REVIEW_SKIPPED_STATUSES = '("cancelled","pending")'

const TENANT_COLUMNS =
  'id, name, slug, domain, loyalty_enabled, loyalty_shadow, order_backend, convex_deployment_url, supabase_order_url, supabase_order_anon_key'

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SnapshotError'
  }
}

export interface StoreSnapshot {
  store: StoreContext
  settings: AutomationSettings
  automations: AutomationRow[]
  data: StoreData
  history: HistoryRow[]
  suppressedPhones: Set<string>
}

function readAll<T>(label: string, page: (from: number, to: number) => PageResult): Promise<T[]> {
  return readAllPages<T>(label, page, { maxRows: MAX_ROWS, makeError: (message) => new SnapshotError(message) })
}

interface TenantRow extends OrderBackendTenantFields {
  id: string
  name: string
  slug: string
  domain: string | null
  loyalty_enabled: boolean | null
  loyalty_shadow: boolean | null
}

function storeContextOf(tenant: TenantRow): StoreContext {
  const [address] = listStoreAddresses({
    slug: tenant.slug,
    domain: tenant.domain,
    rootDomain: getRootDomain(),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null,
  })
  if (!address) throw new SnapshotError('The store has no web address to link to.')
  return { tenantId: tenant.id, storeName: tenant.name, baseUrl: address.baseUrl }
}

async function readTenant(client: SupabaseClient, tenantId: string): Promise<TenantRow> {
  const { data, error } = await client.from('tenants').select(TENANT_COLUMNS).eq('id', tenantId).maybeSingle()
  if (error) throw new SnapshotError(`store could not be read: ${error.message}`)
  if (!data) throw new SnapshotError('store not found')
  return data as unknown as TenantRow
}

async function readSettings(client: SupabaseClient, tenantId: string): Promise<AutomationSettings> {
  const { data, error } = await client.from('sms_settings')
    .select('quiet_hours_start, quiet_hours_end, guest_cap_days, daily_limit, opt_out_line, review_url')
    .eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new SnapshotError(`texting rules could not be read: ${error.message}`)
  return settingsFromRow(data as SettingsRow | null)
}

export async function readAutomations(client: SupabaseClient, tenantId: string): Promise<AutomationRow[]> {
  const { data, error } = await client.from('sms_automations').select(AUTOMATION_COLUMNS)
    .eq('tenant_id', tenantId).order('created_at')
  if (error) throw new SnapshotError(`automations could not be read: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).flatMap((row) => {
    const automation = automationFromRow(row)
    return automation ? [automation] : []
  })
}

async function readGuests(client: SupabaseClient, tenantId: string, textableOnly: boolean): Promise<GuestProfile[]> {
  const rows = await readAll<CustomerRow>('guests', (from, to) => {
    const query = client.from('customers').select(CUSTOMER_COLUMNS).eq('tenant_id', tenantId).not('phone_e164', 'is', null)
    return (textableOnly ? query.eq('sms_consent', true).eq('sms_opt_out', false) : query).order('id').range(from, to)
  })
  return rows.map(guestFromCustomerRow)
}

async function readRecentOrders(client: SupabaseClient, tenantId: string, now: Date): Promise<OrderRow[]> {
  const maxDelayHours = getRecipe('review_request').limits.delayHours?.[1] ?? 72
  const since = new Date(now.getTime() - (maxDelayHours + REVIEW_VALID_HOURS + 1) * HOUR_MS).toISOString()
  const rows = await readAll<{ id: string; customer_id: string; created_at: string }>('orders', (from, to) =>
    client.from('orders').select('id, customer_id, created_at')
      .eq('tenant_id', tenantId).not('customer_id', 'is', null).gte('created_at', since)
      .not('status', 'in', REVIEW_SKIPPED_STATUSES).order('created_at').order('id').range(from, to))
  return rows.map((row) => ({ id: row.id, customerId: row.customer_id, createdAt: row.created_at }))
}

async function readBalances(
  client: SupabaseClient, tenantId: string, guests: readonly GuestProfile[], now: Date,
): Promise<BalanceRow[]> {
  const programs = (await loadActiveLoyaltyPrograms(client, tenantId)).filter((p) => p.version.rules.earnMode === 'stamp')
  if (programs.length === 0) return []
  const rulesById = new Map(programs.map((p) => [p.id, p.version.rules]))
  const idByPhone = new Map<string, string>(guests.flatMap((g) => (g.phone ? [[`phone:${g.phone}`, g.id] as const] : [])))
  const since = new Date(now.getTime() - ALMOST_THERE_LOOKBACK_DAYS * DAY_MS).toISOString()
  const rows = await readAll<{
    program_id: string; customer_id: string | null; customer_key: string; balance: unknown; cycle: number | null; updated_at: string
  }>('stamp cards', (from, to) => client.from('loyalty_balances')
    .select('program_id, customer_id, customer_key, balance, cycle, updated_at')
    .eq('tenant_id', tenantId).in('program_id', [...rulesById.keys()]).gt('balance', 0).gte('updated_at', since)
    .order('id').range(from, to))
  return rows.flatMap((row) => {
    const customerId = row.customer_id ?? idByPhone.get(row.customer_key)
    const rules = rulesById.get(row.program_id)
    const balance = Number(row.balance)
    if (!customerId || !rules || !Number.isFinite(balance)) return []
    return [{ customerId, programId: row.program_id, balance, cycle: row.cycle ?? 0, updatedAt: row.updated_at, rules }]
  })
}

async function readClaimableRewards(client: SupabaseClient, tenantId: string, now: Date) {
  const rows = await readAll<EntitlementDbRow>('rewards', (from, to) => client.from('loyalty_entitlements')
    .select('id, customer_key, issued_at, expires_at, terms')
    .eq('tenant_id', tenantId).in('status', ['issued', 'restored']).like('customer_key', 'phone:%')
    .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
    .order('id').range(from, to))
  return rows.flatMap((row) => {
    const entitlement = entitlementFromRow(row)
    return entitlement ? [entitlement] : []
  })
}

export async function readHistory(client: SupabaseClient, tenantId: string, now: Date): Promise<HistoryRow[]> {
  const since = new Date(now.getTime() - HISTORY_DAYS * DAY_MS).toISOString()
  return readAll<HistoryRow>('text history', (from, to) => client.from('sms_outbox')
    .select('automation_id, recipe, customer_id, phone_e164, occurrence_key, status, created_at, sent_at')
    .eq('tenant_id', tenantId).gte('created_at', since).order('created_at').order('id').range(from, to))
}

async function readSuppressedPhones(client: SupabaseClient, tenantId: string): Promise<Set<string>> {
  const rows = await readAll<{ phone_e164: string }>('blocked numbers', (from, to) =>
    client.from('sms_suppressions').select('phone_e164').eq('tenant_id', tenantId).order('id').range(from, to))
  return new Set(rows.map((row) => row.phone_e164))
}

/**
 * Read one store for these automations (already read with `readAutomations`);
 * their recipes decide which loyalty and order rows are worth reading.
 * `textableOnly` skips guests who can never be texted (no consent, opted
 * out): queueing does not need them, only a preview's "why not" counts do.
 */
export async function loadStoreSnapshot(
  client: SupabaseClient, tenantId: string, automations: readonly AutomationRow[], now: Date,
  { textableOnly = false }: { textableOnly?: boolean } = {},
): Promise<StoreSnapshot> {
  const tenant = await readTenant(client, tenantId)
  const store = storeContextOf(tenant)
  const loyaltyOn = tenant.loyalty_enabled === true && tenant.loyalty_shadow !== true
  const needs = new Set<RecipeId>(automations.map((automation) => automation.recipe))
  const needsOrders = needs.has('review_request') && resolveOrderBackend(tenant) === 'platform'
  const needsRewards = loyaltyOn && (needs.has('loyalty_reward_waiting') || needs.has('loyalty_reward_expiring'))

  const [settings, guests, orders, rewards, history, suppressedPhones] = await Promise.all([
    readSettings(client, tenantId),
    readGuests(client, tenantId, textableOnly),
    needsOrders ? readRecentOrders(client, tenantId, now) : Promise.resolve(null),
    needsRewards ? readClaimableRewards(client, tenantId, now) : Promise.resolve([]),
    readHistory(client, tenantId, now),
    readSuppressedPhones(client, tenantId),
  ])
  const balances = loyaltyOn && needs.has('loyalty_almost_there') ? await readBalances(client, tenantId, guests, now) : []

  return {
    store,
    settings,
    automations: [...automations],
    data: { guests, orders, balances, entitlements: rewards, loyaltyOn },
    history,
    suppressedPhones,
  }
}
