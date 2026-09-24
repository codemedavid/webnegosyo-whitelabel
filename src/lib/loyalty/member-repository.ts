/**
 * Reading the stamp cards: who holds one, and everything about one holder.
 *
 * Service-role only — the ledger tables are read-only to admins under RLS, and
 * every caller already sits behind the `loyalty_manage` grant.
 *
 * Two facts shape this file:
 *
 *  - A member is keyed by `phone:+63…`, not by a customer id. Loyalty is
 *    phone-linked, and a balance can exist before the profile row that would
 *    name it. Names are looked up and attached; a missing one is a missing
 *    name, never a missing member.
 *  - Order history lives in a DIFFERENT table per backend: platform stores use
 *    `orders`, Convex and tenant-Supabase stores use the `customer_external_orders`
 *    facts ledger. Reading only one of them showed an empty history to half the
 *    tenants, so the detail read merges both and says which it could see.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseLoyaltyRules } from './rules'
import { describeLoyaltyReward } from './offer'
import {
  buildLoyaltyMember,
  contactFromCustomerKey,
  rankLoyaltyMembers,
  summarizeLoyaltyMembers,
  type LoyaltyMember,
  type LoyaltyMemberProgramInput,
  type LoyaltyMemberStatus,
  type LoyaltyMemberTotals,
} from './members'
import type { LoyaltyEarnMode, LoyaltyProgramStatus } from './types'

/** Rows read per round trip when walking a table. */
const PAGE = 1000

/** Hard ceiling on members held in memory for one listing. */
const MAX_MEMBERS = 5000

/** Ledger entries and orders shown on one member's profile. */
const HISTORY_LIMIT = 50

const CLAIMABLE_STATUSES = ['issued', 'restored'] as const

export interface ProgramRules {
  programId: string
  programName: string
  programStatus: LoyaltyProgramStatus
  earnMode: LoyaltyEarnMode
  threshold: number
  rewardLabel: string
  rewardExpiryDays: number | null
}

interface BalanceRow {
  program_id: string
  customer_key: string
  customer_id: string | null
  balance: number | string
  lifetime_earned: number | string
  rewards_issued: number | null
  updated_at: string | null
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Every program with its current rules, ready to describe a balance. */
export async function loadProgramRules(
  client: SupabaseClient,
  tenantId: string
): Promise<Map<string, ProgramRules>> {
  const { data, error } = await client
    .from('loyalty_programs')
    .select('id, name, status, earn_mode, current_version_id')
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`Loyalty programs could not be read: ${error.message}`)

  const programs = (data ?? []) as Array<{
    id: string
    name: string
    status: LoyaltyProgramStatus
    earn_mode: LoyaltyEarnMode
    current_version_id: string | null
  }>
  if (programs.length === 0) return new Map()

  const versionIds = programs
    .map((program) => program.current_version_id)
    .filter((id): id is string => Boolean(id))

  const versions = new Map<string, unknown>()
  if (versionIds.length > 0) {
    const { data: versionRows, error: versionError } = await client
      .from('loyalty_program_versions')
      .select('id, rules')
      .in('id', versionIds)
    if (versionError) throw new Error('Reward rules could not be read. Please retry.')
    for (const row of (versionRows ?? []) as Array<{ id: string; rules: unknown }>) {
      versions.set(row.id, row.rules)
    }
  }

  const catalog = new Map<string, ProgramRules>()
  for (const program of programs) {
    const raw = program.current_version_id ? versions.get(program.current_version_id) : undefined
    const parsed = raw === undefined ? null : parseLoyaltyRules(raw)
    const rules = parsed?.ok ? parsed.value : null
    catalog.set(program.id, {
      programId: program.id,
      programName: program.name,
      programStatus: program.status,
      earnMode: rules?.earnMode ?? program.earn_mode,
      // A zero threshold is the honest answer for unreadable rules: the member
      // engine renders that as unknown progress rather than inventing a bar.
      threshold: rules?.threshold ?? 0,
      rewardLabel: rules ? describeLoyaltyReward(rules.reward) : 'Reward',
      rewardExpiryDays: rules?.rewardExpiryDays ?? null,
    })
  }
  return catalog
}

/** Walk a loyalty table for one tenant, page by page. */
async function readAll<Row>(
  client: SupabaseClient,
  table: string,
  columns: string,
  tenantId: string,
  refine?: (query: ReturnType<SupabaseClient['from']>) => unknown,
  cap = MAX_MEMBERS
): Promise<Row[]> {
  const rows: Row[] = []
  for (let offset = 0; offset < cap; offset += PAGE) {
    let query = client.from(table).select(columns).eq('tenant_id', tenantId)
    if (refine) query = refine(query as never) as typeof query
    const { data, error } = await query.order('id').range(offset, offset + PAGE - 1)
    if (error) throw new Error(`${table} could not be read: ${error.message}`)
    const page = (data ?? []) as unknown as Row[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

/** Claimable rewards per `programId|customerKey`. */
async function loadClaimableRewards(
  client: SupabaseClient,
  tenantId: string
): Promise<Map<string, number>> {
  const nowIso = new Date().toISOString()
  const rows = await readAll<{ program_id: string; customer_key: string }>(
    client,
    'loyalty_entitlements',
    'id, program_id, customer_key',
    tenantId,
    (query) =>
      (query as never as { in: (c: string, v: readonly string[]) => { or: (f: string) => unknown } })
        .in('status', CLAIMABLE_STATUSES)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
  )

  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.program_id}|${row.customer_key}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/**
 * Names for the balances we hold.
 *
 * A balance carries a `customer_id` only when the profile already existed when
 * the stamp landed, so the phone number is the second lookup — without it, a
 * customer captured after their first stamp would show as a bare number.
 */
async function loadMemberNames(
  client: SupabaseClient,
  tenantId: string,
  balances: BalanceRow[]
): Promise<Map<string, { name: string | null; customerId: string }>> {
  const byKey = new Map<string, { name: string | null; customerId: string }>()

  const ids = [...new Set(balances.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))]
  const phones = [
    ...new Set(
      balances
        .map((row) => contactFromCustomerKey(row.customer_key).phone)
        .filter((phone): phone is string => Boolean(phone))
    ),
  ]

  const lookups: Array<PromiseLike<{ data: unknown }>> = []
  if (ids.length > 0) {
    lookups.push(
      client.from('customers').select('id, name, phone_e164').in('id', ids.slice(0, MAX_MEMBERS))
    )
  }
  if (phones.length > 0) {
    lookups.push(
      client
        .from('customers')
        .select('id, name, phone_e164')
        .eq('tenant_id', tenantId)
        .in('phone_e164', phones.slice(0, MAX_MEMBERS))
    )
  }

  const results = await Promise.all(lookups)
  const profiles = new Map<string, { id: string; name: string | null; phone_e164: string | null }>()
  for (const result of results) {
    for (const row of ((result.data ?? []) as Array<{
      id: string
      name: string | null
      phone_e164: string | null
    }>)) {
      profiles.set(row.id, row)
    }
  }

  const byPhone = new Map<string, { id: string; name: string | null }>()
  for (const profile of profiles.values()) {
    if (profile.phone_e164) byPhone.set(profile.phone_e164, { id: profile.id, name: profile.name })
  }

  for (const balance of balances) {
    if (byKey.has(balance.customer_key)) continue
    const direct = balance.customer_id ? profiles.get(balance.customer_id) : undefined
    if (direct) {
      byKey.set(balance.customer_key, { name: direct.name, customerId: direct.id })
      continue
    }
    const phone = contactFromCustomerKey(balance.customer_key).phone
    const matched = phone ? byPhone.get(phone) : undefined
    if (matched) byKey.set(balance.customer_key, { name: matched.name, customerId: matched.id })
  }

  return byKey
}

export interface ListMembersOptions {
  /** Restrict to one program. Omit for every card in the store. */
  programId?: string | null
  /** Case-insensitive match on name or phone. */
  search?: string | null
  status?: LoyaltyMemberStatus | null
  limit?: number
  nowMs?: number
}

export interface LoyaltyMemberPage {
  members: LoyaltyMember[]
  /** Counts across the whole store, before `status` and `search` narrow it. */
  totals: LoyaltyMemberTotals
  /** True when the store holds more cards than one listing can carry. */
  isTruncated: boolean
}

/** Every customer holding a balance, ranked by who is closest to a reward. */
export async function listLoyaltyMembers(
  client: SupabaseClient,
  tenantId: string,
  options: ListMembersOptions = {}
): Promise<LoyaltyMemberPage> {
  const nowMs = options.nowMs ?? Date.now()

  const [catalog, balances, claimable] = await Promise.all([
    loadProgramRules(client, tenantId),
    readAll<BalanceRow>(
      client,
      'loyalty_balances',
      'id, program_id, customer_key, customer_id, balance, lifetime_earned, rewards_issued, updated_at',
      tenantId
    ),
    loadClaimableRewards(client, tenantId),
  ])

  const scoped = options.programId
    ? balances.filter((row) => row.program_id === options.programId)
    : balances

  const names = await loadMemberNames(client, tenantId, scoped)

  const grouped = new Map<string, { customerId: string | null; programs: LoyaltyMemberProgramInput[] }>()
  for (const row of scoped) {
    const rules = catalog.get(row.program_id)
    // A balance whose program is gone cannot be described. Cascade deletes make
    // this all but impossible; dropping it beats rendering "undefined".
    if (!rules) continue

    const entry = grouped.get(row.customer_key) ?? {
      customerId: row.customer_id ?? names.get(row.customer_key)?.customerId ?? null,
      programs: [],
    }
    entry.programs.push({
      ...rules,
      balance: toNumber(row.balance),
      lifetimeEarned: toNumber(row.lifetime_earned),
      rewardsIssued: toNumber(row.rewards_issued),
      rewardsAvailable: claimable.get(`${row.program_id}|${row.customer_key}`) ?? 0,
      lastActivityAt: row.updated_at,
    })
    grouped.set(row.customer_key, entry)
  }

  const all = [...grouped.entries()].map(([customerKey, entry]) =>
    buildLoyaltyMember(
      {
        customerKey,
        customerId: entry.customerId,
        name: names.get(customerKey)?.name ?? null,
        programs: entry.programs,
      },
      nowMs
    )
  )

  const totals = summarizeLoyaltyMembers(all)

  const needle = options.search?.trim().toLowerCase() ?? ''
  const filtered = all.filter((member) => {
    if (options.status && member.status !== options.status) return false
    if (!needle) return true
    return (
      (member.name ?? '').toLowerCase().includes(needle) ||
      (member.phone ?? '').toLowerCase().includes(needle) ||
      (member.email ?? '').toLowerCase().includes(needle)
    )
  })

  const ranked = rankLoyaltyMembers(filtered)
  const limit = options.limit && options.limit > 0 ? options.limit : ranked.length

  return {
    members: ranked.slice(0, limit),
    totals,
    isTruncated: balances.length >= MAX_MEMBERS,
  }
}

export interface LoyaltyMemberReward {
  id: string
  programId: string
  programName: string
  label: string
  status: string
  issuedAt: string | null
  expiresAt: string | null
  consumedAt: string | null
  resolutionNote: string | null
  /** True while a register holds it mid-sale; it cannot be settled by hand. */
  isReserved: boolean
}

export interface LoyaltyLedgerEntry {
  id: string
  programId: string
  programName: string
  kind: string
  delta: number
  isShadow: boolean
  note: string | null
  orderRef: string | null
  createdAt: string
}

export interface LoyaltyMemberOrder {
  id: string
  backend: 'platform_supabase' | 'convex' | 'tenant_supabase'
  reference: string
  total: number
  orderedAt: string
  channel: string | null
  status: string | null
  paymentStatus: string | null
  address: string | null
  items: Array<{ name: string; quantity: number }>
}

export interface LoyaltyMemberProfile {
  customerId: string | null
  name: string | null
  phone: string | null
  email: string | null
  orderCount: number
  totalSpent: number
  averageOrderValue: number
  firstOrderAt: string | null
  lastOrderAt: string | null
  smsConsent: boolean
  smsOptOut: boolean
  notes: string | null
}

export interface LoyaltyMemberDetail {
  member: LoyaltyMember
  profile: LoyaltyMemberProfile | null
  rewards: LoyaltyMemberReward[]
  history: LoyaltyLedgerEntry[]
  orders: LoyaltyMemberOrder[]
  /** Every distinct address this customer has ordered to, most recent first. */
  addresses: string[]
}

function programNameFrom(catalog: Map<string, ProgramRules>, programId: string): string {
  return catalog.get(programId)?.programName ?? 'Removed program'
}

async function loadMemberOrders(
  client: SupabaseClient,
  tenantId: string,
  customerId: string | null
): Promise<LoyaltyMemberOrder[]> {
  if (!customerId) return []

  // Both tables, always: a store can change backend, and the customer's history
  // does not move when it does.
  const [platform, external] = await Promise.all([
    client
      .from('orders')
      .select('id, total, created_at, order_type, status, payment_status, customer_data')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    client
      .from('customer_external_orders')
      .select('id, backend, external_order_id, total, ordered_at, channel, status, payment_status, items, address')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('ordered_at', { ascending: false })
      .limit(HISTORY_LIMIT),
  ])

  const { readOrderAddress } = await import('@/lib/customer-external-orders')

  const orders: LoyaltyMemberOrder[] = []

  for (const row of ((platform.data ?? []) as Array<Record<string, unknown>>)) {
    orders.push({
      id: String(row.id),
      backend: 'platform_supabase',
      reference: String(row.id).slice(0, 8),
      total: toNumber(row.total),
      orderedAt: String(row.created_at),
      channel: (row.order_type as string | null) ?? null,
      status: (row.status as string | null) ?? null,
      paymentStatus: (row.payment_status as string | null) ?? null,
      address: readOrderAddress(row.customer_data as Record<string, unknown> | null),
      items: [],
    })
  }

  for (const row of ((external.data ?? []) as Array<Record<string, unknown>>)) {
    const items = Array.isArray(row.items)
      ? (row.items as Array<{ name?: unknown; quantity?: unknown }>)
          .filter((item) => typeof item?.name === 'string')
          .map((item) => ({ name: String(item.name), quantity: toNumber(item.quantity) || 1 }))
      : []
    orders.push({
      id: String(row.id),
      backend: (row.backend as LoyaltyMemberOrder['backend']) ?? 'convex',
      reference: String(row.external_order_id ?? '').slice(-8),
      total: toNumber(row.total),
      orderedAt: String(row.ordered_at),
      channel: (row.channel as string | null) ?? null,
      status: (row.status as string | null) ?? null,
      paymentStatus: (row.payment_status as string | null) ?? null,
      address: (row.address as string | null) ?? null,
      items,
    })
  }

  return orders
    .sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt))
    .slice(0, HISTORY_LIMIT)
}

/** One member, with everything a merchant would want on the counter screen. */
export async function readLoyaltyMemberDetail(
  client: SupabaseClient,
  tenantId: string,
  customerKey: string,
  nowMs = Date.now()
): Promise<LoyaltyMemberDetail | null> {
  const page = await listLoyaltyMembers(client, tenantId, { nowMs })
  const member = page.members.find((row) => row.customerKey === customerKey)
  if (!member) return null

  const catalog = await loadProgramRules(client, tenantId)

  const [entitlements, ledger, profileRow] = await Promise.all([
    client
      .from('loyalty_entitlements')
      .select('id, program_id, terms, status, issued_at, expires_at, consumed_at, resolution_note')
      .eq('tenant_id', tenantId)
      .eq('customer_key', customerKey)
      .order('issued_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    client
      .from('loyalty_ledger')
      .select('id, program_id, kind, delta, is_shadow, note, order_backend, external_order_id, created_at')
      .eq('tenant_id', tenantId)
      .eq('customer_key', customerKey)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    member.customerId
      ? client
          .from('customers')
          .select(
            'id, name, phone_e164, email, order_count, total_spent, average_order_value, first_order_at, last_order_at, sms_consent, sms_opt_out, notes'
          )
          .eq('tenant_id', tenantId)
          .eq('id', member.customerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (entitlements.error) throw new Error(`Rewards could not be read: ${entitlements.error.message}`)
  if (ledger.error) throw new Error(`Stamp history could not be read: ${ledger.error.message}`)

  const rewards: LoyaltyMemberReward[] = ((entitlements.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => {
      const terms = (row.terms ?? {}) as { programName?: string; reward?: unknown }
      const rules = catalog.get(String(row.program_id))
      return {
        id: String(row.id),
        programId: String(row.program_id),
        programName: terms.programName ?? programNameFrom(catalog, String(row.program_id)),
        // The terms frozen at issue time win: a rule change afterwards must not
        // rewrite what the customer was promised.
        label: terms.reward
          ? describeLoyaltyReward(terms.reward as never)
          : rules?.rewardLabel ?? 'Reward',
        status: String(row.status),
        issuedAt: (row.issued_at as string | null) ?? null,
        expiresAt: (row.expires_at as string | null) ?? null,
        consumedAt: (row.consumed_at as string | null) ?? null,
        resolutionNote: (row.resolution_note as string | null) ?? null,
        isReserved: row.status === 'reserved',
      }
    }
  )

  const history: LoyaltyLedgerEntry[] = ((ledger.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: String(row.id),
      programId: String(row.program_id),
      programName: programNameFrom(catalog, String(row.program_id)),
      kind: String(row.kind),
      delta: toNumber(row.delta),
      isShadow: row.is_shadow === true,
      note: (row.note as string | null) ?? null,
      orderRef: row.external_order_id ? String(row.external_order_id).slice(-8) : null,
      createdAt: String(row.created_at),
    })
  )

  const orders = await loadMemberOrders(client, tenantId, member.customerId)

  const addresses = [
    ...new Set(
      orders
        .map((order) => order.address)
        .filter((address): address is string => Boolean(address?.trim()))
    ),
  ]

  const raw = (profileRow as { data: Record<string, unknown> | null }).data
  const profile: LoyaltyMemberProfile | null = raw
    ? {
        customerId: String(raw.id),
        name: (raw.name as string | null) ?? null,
        phone: (raw.phone_e164 as string | null) ?? member.phone,
        email: (raw.email as string | null) ?? member.email,
        orderCount: toNumber(raw.order_count),
        totalSpent: toNumber(raw.total_spent),
        averageOrderValue: toNumber(raw.average_order_value),
        firstOrderAt: (raw.first_order_at as string | null) ?? null,
        lastOrderAt: (raw.last_order_at as string | null) ?? null,
        smsConsent: raw.sms_consent === true,
        smsOptOut: raw.sms_opt_out === true,
        notes: (raw.notes as string | null) ?? null,
      }
    : null

  return { member, profile, rewards, history, orders, addresses }
}
