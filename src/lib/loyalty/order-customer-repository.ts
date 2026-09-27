/**
 * The reads behind "who is ordering, and did it earn a stamp?" for a page of orders.
 *
 * Service-role only, behind the `loyalty_manage` grant — the ledger tables are
 * unreadable to admins under RLS. Batched: one round of queries per page of
 * orders, never one per order, because the order queue asks this on every
 * refresh.
 *
 * An order appears in the answer only when the store knows its customer — a
 * profile row, a card, or a stamp earned on the order. Walk-ins and first-time
 * numbers are left out so the queue can badge exactly the regulars.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCustomerIdentity } from '@/lib/customer-identity'
import { buildLoyaltyMember, contactFromCustomerKey, type LoyaltyMember } from './members'
import { CLAIMABLE_STATUSES, loadProgramRules, type ProgramRules } from './member-repository'
import { loadLoyaltyTenantFlags } from './store'
import {
  customerKeyForOrder,
  summarizeOrderStamp,
  type OrderCustomerSummary,
  type OrderCustomersRequest,
  type OrderCustomersResult,
  type OrderLedgerRow,
} from './order-customers'

interface ProfileRow {
  id: string
  name: string | null
  phone_e164: string | null
  order_count: number | string | null
  total_spent: number | string | null
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function readOrderLedger(
  client: SupabaseClient,
  tenantId: string,
  request: OrderCustomersRequest
): Promise<Map<string, OrderLedgerRow[]>> {
  const { data, error } = await client
    .from('loyalty_ledger')
    .select('external_order_id, program_id, customer_key, kind, delta, is_shadow')
    .eq('tenant_id', tenantId)
    .eq('order_backend', request.backend)
    .in(
      'external_order_id',
      request.orders.map((order) => order.orderId)
    )
  if (error) throw new Error(`Stamp ledger could not be read: ${error.message}`)

  const byOrder = new Map<string, OrderLedgerRow[]>()
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const orderId = String(row.external_order_id)
    const rows = byOrder.get(orderId) ?? []
    rows.push({
      orderId,
      programId: String(row.program_id),
      customerKey: String(row.customer_key ?? ''),
      kind: String(row.kind),
      delta: toNumber(row.delta),
      isShadow: row.is_shadow === true,
    })
    byOrder.set(orderId, rows)
  }
  return byOrder
}

async function readProfiles(
  client: SupabaseClient,
  tenantId: string,
  phones: string[]
): Promise<Map<string, ProfileRow>> {
  if (phones.length === 0) return new Map()
  const { data, error } = await client
    .from('customers')
    .select('id, name, phone_e164, order_count, total_spent')
    .eq('tenant_id', tenantId)
    .in('phone_e164', phones)
  if (error) throw new Error(`Customer profiles could not be read: ${error.message}`)

  const byPhone = new Map<string, ProfileRow>()
  for (const row of (data ?? []) as ProfileRow[]) {
    if (row.phone_e164) byPhone.set(row.phone_e164, row)
  }
  return byPhone
}

async function readCards(
  client: SupabaseClient,
  tenantId: string,
  customerKeys: string[],
  profiles: Map<string, ProfileRow>,
  catalog: Map<string, ProgramRules>,
  nowMs: number
): Promise<Map<string, LoyaltyMember>> {
  if (customerKeys.length === 0) return new Map()

  const nowIso = new Date(nowMs).toISOString()
  const [balances, rewards] = await Promise.all([
    client
      .from('loyalty_balances')
      .select('program_id, customer_key, customer_id, balance, lifetime_earned, rewards_issued, updated_at')
      .eq('tenant_id', tenantId)
      .in('customer_key', customerKeys),
    client
      .from('loyalty_entitlements')
      .select('program_id, customer_key')
      .eq('tenant_id', tenantId)
      .in('customer_key', customerKeys)
      .in('status', CLAIMABLE_STATUSES)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
  ])
  if (balances.error) throw new Error(`Stamp balances could not be read: ${balances.error.message}`)
  if (rewards.error) throw new Error(`Rewards could not be read: ${rewards.error.message}`)

  const claimable = new Map<string, number>()
  for (const row of (rewards.data ?? []) as Array<{ program_id: string; customer_key: string }>) {
    const key = `${row.program_id}|${row.customer_key}`
    claimable.set(key, (claimable.get(key) ?? 0) + 1)
  }

  const grouped = new Map<string, Parameters<typeof buildLoyaltyMember>[0]>()
  for (const row of (balances.data ?? []) as Array<Record<string, unknown>>) {
    const customerKey = String(row.customer_key)
    const rules = catalog.get(String(row.program_id))
    if (!rules) continue
    const phone = contactFromCustomerKey(customerKey).phone
    const profile = phone ? profiles.get(phone) : undefined
    const entry = grouped.get(customerKey) ?? {
      customerKey,
      customerId: (row.customer_id as string | null) ?? profile?.id ?? null,
      name: profile?.name ?? null,
      programs: [],
    }
    entry.programs.push({
      ...rules,
      balance: toNumber(row.balance),
      lifetimeEarned: toNumber(row.lifetime_earned),
      rewardsIssued: toNumber(row.rewards_issued),
      rewardsAvailable: claimable.get(`${row.program_id}|${customerKey}`) ?? 0,
      lastActivityAt: (row.updated_at as string | null) ?? null,
    })
    grouped.set(customerKey, entry)
  }

  const members = new Map<string, LoyaltyMember>()
  for (const [customerKey, input] of grouped) {
    members.set(customerKey, buildLoyaltyMember(input, nowMs))
  }
  return members
}

export async function readOrderCustomers(
  client: SupabaseClient,
  tenantId: string,
  request: OrderCustomersRequest,
  nowMs = Date.now()
): Promise<OrderCustomersResult> {
  if (request.orders.length === 0) return { isLoyaltyLive: false, customers: [] }

  const [ledger, flags, catalog] = await Promise.all([
    readOrderLedger(client, tenantId, request),
    loadLoyaltyTenantFlags(client, tenantId),
    loadProgramRules(client, tenantId),
  ])
  const isLoyaltyLive = flags.isEnabled && !flags.isShadow
  const hasActiveProgram = [...catalog.values()].some((rules) => rules.programStatus === 'active')

  const resolved = request.orders.map((order) => {
    const rows = ledger.get(order.orderId) ?? []
    const identity = resolveCustomerIdentity({ contact: order.contact, customerData: order.customerData })
    const customerKey = customerKeyForOrder(rows, identity.phoneE164)
    return { order, rows, identity, customerKey }
  })

  const keys = [...new Set(resolved.map((entry) => entry.customerKey).filter((key): key is string => Boolean(key)))]
  const phones = [
    ...new Set(keys.map((key) => contactFromCustomerKey(key).phone).filter((phone): phone is string => Boolean(phone))),
  ]

  const profiles = await readProfiles(client, tenantId, phones)
  const cards = await readCards(client, tenantId, keys, profiles, catalog, nowMs)

  const customers: OrderCustomerSummary[] = []
  for (const { order, rows, identity, customerKey } of resolved) {
    if (!customerKey) continue

    const phone = contactFromCustomerKey(customerKey).phone
    const profile = phone ? profiles.get(phone) : undefined
    const member = cards.get(customerKey)
    const stamp = summarizeOrderStamp(rows, { status: order.status, isLoyaltyLive, hasActiveProgram })
    const hasEarnHistory = stamp.state === 'earned' || stamp.state === 'returned'
    if (!profile && !member && !hasEarnHistory) continue

    customers.push({
      orderId: order.orderId,
      customerKey,
      customerId: profile?.id ?? member?.customerId ?? null,
      name: profile?.name ?? member?.name ?? identity.name,
      hasProfile: Boolean(profile),
      orderCount: profile ? toNumber(profile.order_count) : null,
      totalSpent: profile ? toNumber(profile.total_spent) : null,
      isMember: Boolean(member),
      status: member?.status ?? null,
      headline: member?.headline ?? null,
      rewardsAvailable: member?.rewardsAvailable ?? 0,
      stamp: {
        ...stamp,
        programName: stamp.programId ? catalog.get(stamp.programId)?.programName ?? null : null,
      },
    })
  }

  return { isLoyaltyLive, customers }
}
