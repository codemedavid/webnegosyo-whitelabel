/**
 * Supabase-backed implementation of the loyalty ports, plus the reads the
 * lifecycle bridge needs (tenant flags and the order fact itself).
 *
 * Everything here runs under the service-role client: the ledger tables are
 * read-only to admins by RLS, and `apply_loyalty_earning` is granted to
 * service_role alone.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ledgerRowToFact,
  platformOrderToFact,
  type CustomerOrderFact,
  type ExternalLedgerFactRow,
  type PlatformOrderFactRow,
  type PlatformOrderItemFactRow,
} from '@/lib/customer-order-facts'
import type { LoyaltyEarningDeps } from './apply'
import { parseLoyaltyRules } from './rules'
import type { LoyaltyProgram } from './types'

const PROGRAM_SELECT =
  'id, tenant_id, name, scope, outlet_id, status, activates_at, ends_at, current_version_id'
const VERSION_SELECT = 'id, program_id, version, rules, created_at'
const ORDERS_SELECT =
  'id, customer_id, customer_contact, status, payment_status, outlet_id, total, created_at, updated_at, source'
const ORDER_ITEMS_SELECT = 'menu_item_id, menu_item_name, quantity, price'
const LEDGER_SELECT =
  'backend, external_order_id, customer_id, source, status, payment_status, outlet_id, total, ordered_at, completed_at, updated_at, items'

interface ProgramRow {
  id: string
  tenant_id: string
  name: string
  scope: 'business' | 'branch'
  outlet_id: string | null
  status: LoyaltyProgram['status']
  activates_at: string | null
  ends_at: string | null
  current_version_id: string | null
}

interface VersionRow {
  id: string
  program_id: string
  version: number
  rules: unknown
  created_at: string
}

/** Programs that earn today, each with its current version's parsed rules. */
export async function loadActiveLoyaltyPrograms(
  client: SupabaseClient,
  tenantId: string,
): Promise<LoyaltyProgram[]> {
  const { data: programRows, error } = await client
    .from('loyalty_programs')
    .select(PROGRAM_SELECT)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .not('current_version_id', 'is', null)

  if (error) throw new Error(`loyalty programs could not be read: ${error.message}`)
  const programs = (programRows ?? []) as unknown as ProgramRow[]
  if (programs.length === 0) return []

  const { data: versionRows, error: versionError } = await client
    .from('loyalty_program_versions')
    .select(VERSION_SELECT)
    .in('id', programs.map((p) => p.current_version_id as string))

  if (versionError) throw new Error(`loyalty versions could not be read: ${versionError.message}`)
  const versions = new Map(((versionRows ?? []) as unknown as VersionRow[]).map((v) => [v.id, v]))

  const result: LoyaltyProgram[] = []
  for (const row of programs) {
    const version = row.current_version_id ? versions.get(row.current_version_id) : undefined
    if (!version) continue
    const rules = parseLoyaltyRules(version.rules)
    if (!rules.ok) {
      // A program with rules the engine cannot read earns nothing, loudly.
      console.error(`[loyalty] program ${row.id} version ${version.version} has invalid rules: ${rules.error}`)
      continue
    }
    result.push({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      scope: row.scope,
      outletId: row.outlet_id,
      status: row.status,
      activatesAt: row.activates_at,
      endsAt: row.ends_at,
      version: { id: version.id, version: version.version, rules: rules.value, createdAt: version.created_at },
    })
  }
  return result
}

export function createSupabaseLoyaltyDeps(client: SupabaseClient): LoyaltyEarningDeps {
  return {
    loadActivePrograms: (tenantId) => loadActiveLoyaltyPrograms(client, tenantId),

    async loadOrderEarns(tenantId, orderBackend, externalOrderId) {
      const { data, error } = await client
        .from('loyalty_ledger')
        .select('program_id, version_id, customer_key, delta, is_shadow')
        .eq('tenant_id', tenantId)
        .eq('order_backend', orderBackend)
        .eq('external_order_id', externalOrderId)
        .eq('kind', 'earn')
      if (error) throw new Error(`loyalty earns could not be read: ${error.message}`)
      return (data ?? []).map((row) => {
        const delta = Number(row.delta)
        if (row.delta == null || !Number.isFinite(delta)) throw new Error('loyalty earn has an invalid delta')
        return { programId: row.program_id, versionId: row.version_id, customerKey: row.customer_key, delta, isShadow: row.is_shadow }
      })
    },

    async applyLedgerEntry(entry) {
      const { data, error } = await client.rpc('apply_loyalty_earning', {
        p_tenant_id: entry.tenantId,
        p_program_id: entry.programId,
        p_version_id: entry.versionId,
        p_customer_key: entry.customerKey,
        p_customer_id: entry.customerId,
        p_kind: entry.kind,
        p_delta: entry.delta,
        p_order_backend: entry.orderBackend,
        p_external_order_id: entry.externalOrderId,
        p_threshold: entry.threshold,
        p_reward_terms: entry.rewardTerms,
        p_reward_expires_at: entry.rewardExpiresAt,
        p_shadow: entry.isShadow,
        p_actor: entry.actor ?? null,
        p_note: entry.note ?? null,
      })
      if (error) throw new Error(`apply_loyalty_earning failed: ${error.message}`)
      const result = (data ?? {}) as { applied?: boolean; reason?: string; entitlementsIssued?: number; balance?: number }
      return {
        applied: result.applied === true,
        reason: result.reason,
        entitlementsIssued: result.entitlementsIssued,
        balance: result.balance,
      }
    },
  }
}

export interface LoyaltyTenantFlags {
  isEnabled: boolean
  isShadow: boolean
}

export async function loadLoyaltyTenantFlags(
  client: SupabaseClient,
  tenantId: string,
): Promise<LoyaltyTenantFlags> {
  const { data, error } = await client
    .from('tenants')
    .select('loyalty_enabled, loyalty_shadow')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw new Error(`loyalty tenant flags could not be read: ${error.message}`)
  const row = data as { loyalty_enabled?: boolean | null; loyalty_shadow?: boolean | null } | null
  return {
    isEnabled: row?.loyalty_enabled === true,
    // Unknown reads as shadow: a flag that could not be read must not go live.
    isShadow: row?.loyalty_shadow !== false,
  }
}

export interface LoyaltyOrderRef {
  tenantId: string
  backend: CustomerOrderFact['backend']
  externalOrderId: string
}

/** The phone a ledger row's customer is known by. */
async function loadCustomerPhone(client: SupabaseClient, tenantId: string, customerId: string): Promise<string | null> {
  const { data, error } = await client.from('customers').select('phone_e164').eq('tenant_id', tenantId).eq('id', customerId).maybeSingle()
  if (error) throw new Error(`loyalty customer phone could not be read: ${error.message}`)
  return (data as { phone_e164?: string | null } | null)?.phone_e164 ?? null
}

/**
 * The order as a fact, from wherever it lives on the platform: the `orders`
 * table for platform-backed tenants, the customer ledger for the rest. Null
 * when there is no such order — an anonymous external order never produced a
 * ledger row, and that is a normal outcome.
 */
export async function loadLoyaltyOrderFact(
  client: SupabaseClient,
  ref: LoyaltyOrderRef,
): Promise<CustomerOrderFact | null> {
  if (ref.backend === 'platform_supabase') {
    const { data: order, error } = await client
      .from('orders')
      .select(ORDERS_SELECT)
      .eq('id', ref.externalOrderId)
      .eq('tenant_id', ref.tenantId)
      .maybeSingle()
    if (error) throw new Error(`loyalty order could not be read: ${error.message}`)
    if (!order) return null
    const { data: items, error: itemsError } = await client.from('order_items').select(ORDER_ITEMS_SELECT).eq('order_id', ref.externalOrderId)
    if (itemsError) throw new Error(`loyalty order items could not be read: ${itemsError.message}`)
    return platformOrderToFact(
      order as unknown as PlatformOrderFactRow,
      (items ?? []) as unknown as PlatformOrderItemFactRow[],
    )
  }

  const { data: row, error } = await client
    .from('customer_external_orders')
    .select(LEDGER_SELECT)
    .eq('tenant_id', ref.tenantId)
    .eq('backend', ref.backend)
    .eq('external_order_id', ref.externalOrderId)
    .maybeSingle()
  if (error) throw new Error(`loyalty external order could not be read: ${error.message}`)
  if (!row) return null

  const fact = ledgerRowToFact({ ...(row as unknown as ExternalLedgerFactRow), backend: ref.backend })
  const phoneE164 = fact.customerId ? await loadCustomerPhone(client, ref.tenantId, fact.customerId) : null
  return { ...fact, phoneE164 }
}
