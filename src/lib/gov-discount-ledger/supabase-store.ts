/**
 * The sales book's database side — service role only.
 *
 * Every method is scoped to the tenant the ROUTE verified; nothing here trusts
 * an id from a request body on its own.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { TAX_PROFILE_COLUMNS, taxProfileFromRow, type RecordGovDiscountRequest } from '@/lib/gov-discount'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { readOrderDiscount } from '@/lib/order-discount'
import type { ActiveGrant, ClaimRow, ConsumedApproval, LedgerOrderState, LedgerStore } from './record-service'
import type { SavedOrderLine } from './verify'

type Db = SupabaseClient<Database>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const APPROVAL_TOLERANCE = 0.01
const LEDGER_CONFLICT_KEY = 'tenant_id,backend,external_order_id,revision,claimant_ref,event'
const TENANT_BACKEND_COLUMNS = 'order_backend, convex_deployment_url'
const APPROVAL_COLUMNS = 'id, approver_user_id, approver_name, approved_reduction, consumed_order, sale_fingerprint'

interface ApprovalRow {
  id: string
  approver_user_id: string | null
  approver_name: string
  approved_reduction: number | string
  consumed_order: string | null
  sale_fingerprint: string | null
}

function toConsumed(row: ApprovalRow): ConsumedApproval {
  return { approvalId: row.id, approverUserId: row.approver_user_id, approverName: row.approver_name }
}

/** A stored row as a row to insert again (a reversal): no id, no timestamp. */
function withoutDatabaseKeys(row: ClaimRow & { id: string; created_at: string }): ClaimRow {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== 'id' && key !== 'created_at'),
  ) as unknown as ClaimRow
}

function fail(context: string, message: string): never {
  throw new Error(`[gov-discount-ledger] ${context}: ${message}`)
}

export function createSupabaseLedgerStore(db: Db): LedgerStore {
  return {
    async loadTaxProfile(tenantId) {
      const { data, error } = await db
        .from('store_tax_profiles')
        .select(TAX_PROFILE_COLUMNS)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (error) fail('tax profile', error.message)
      return taxProfileFromRow(data)
    },

    async loadExcludedMenuItemIds(tenantId, menuItemIds) {
      const ids = [...new Set(menuItemIds.filter((id) => UUID_RE.test(id)))]
      if (ids.length === 0) return new Set()
      const { data, error } = await db
        .from('menu_items')
        .select('id, gov_discount_eligible, category:categories(gov_discount_eligible)')
        .eq('tenant_id', tenantId)
        .in('id', ids)
      if (error) fail('eligibility', error.message)
      const excluded = new Set<string>()
      for (const row of data ?? []) {
        const category = row.category as { gov_discount_eligible?: boolean } | null
        if (row.gov_discount_eligible === false || category?.gov_discount_eligible === false) {
          excluded.add(row.id)
        }
      }
      return excluded
    },

    async loadSavedLines(request: RecordGovDiscountRequest) {
      if (request.backend !== 'platform_supabase' || !UUID_RE.test(request.externalOrderId)) {
        return null
      }
      const { data: order, error } = await db
        .from('orders')
        .select('id')
        .eq('id', request.externalOrderId)
        .eq('tenant_id', request.tenantId)
        .maybeSingle()
      if (error) fail('order', error.message)
      // The register records right after a write-behind sale; if the order is
      // not there yet, verify against the register's own lines.
      if (!order) return null

      const { data: items, error: itemsError } = await db
        .from('order_items')
        .select('menu_item_id, quantity, subtotal')
        .eq('order_id', request.externalOrderId)
      if (itemsError) fail('order items', itemsError.message)
      return (items ?? []).map(
        (item): SavedOrderLine => ({
          menuItemId: item.menu_item_id,
          quantity: Number(item.quantity),
          amount: Number(item.subtotal),
        }),
      )
    },

    async loadOrderState(order): Promise<LedgerOrderState> {
      // The tenant's REAL backend decides, never the body's claim: a platform
      // store's order is always read, whatever backend the request names.
      const { data: tenant, error: tenantError } = await db
        .from('tenants')
        .select(TENANT_BACKEND_COLUMNS)
        .eq('id', order.tenantId)
        .maybeSingle()
      if (tenantError) fail('tenant backend', tenantError.message)
      if (!tenant || resolveOrderBackend(tenant as OrderBackendTenantFields) !== 'platform') {
        return { readable: false }
      }
      if (order.backend !== 'platform_supabase' || !UUID_RE.test(order.externalOrderId)) {
        return { readable: true, exists: false }
      }
      const { data, error } = await db
        .from('orders')
        .select('status, discount_data, customer_data')
        .eq('id', order.externalOrderId)
        .eq('tenant_id', order.tenantId)
        .maybeSingle()
      if (error) fail('order state', error.message)
      if (!data) return { readable: true, exists: false }
      const government = readOrderDiscount(data)?.government
      return {
        readable: true,
        exists: true,
        cancelled: data.status === 'cancelled',
        hasGovernment: (government?.claimants.length ?? 0) > 0,
      }
    },

    async consumeApproval({ approvalId, tenantId, cashierUserId, reduction, orderRef, saleFingerprint }) {
      const { data, error } = await db
        .from('gov_discount_approvals')
        .update({ consumed_at: new Date().toISOString(), consumed_order: orderRef })
        .eq('id', approvalId)
        .eq('tenant_id', tenantId)
        .eq('cashier_user_id', cashierUserId)
        .eq('sale_fingerprint', saleFingerprint)
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .gte('approved_reduction', reduction - APPROVAL_TOLERANCE)
        .select(APPROVAL_COLUMNS)
        .maybeSingle()
      if (error) fail('approval', error.message)
      if (data) return toConsumed(data as ApprovalRow)

      // A retry or a later revision of the SAME order finds the approval it
      // already consumed — but only for the same claimants and never for a
      // bigger discount than was approved. Compared in code, exactly: the
      // order id never reaches a LIKE pattern.
      const { data: earlier, error: earlierError } = await db
        .from('gov_discount_approvals')
        .select(APPROVAL_COLUMNS)
        .eq('id', approvalId)
        .eq('tenant_id', tenantId)
        .eq('cashier_user_id', cashierUserId)
        .maybeSingle()
      if (earlierError) fail('approval', earlierError.message)
      const row = earlier as ApprovalRow | null
      const sameOrder = orderRef.slice(0, orderRef.lastIndexOf('#') + 1)
      const isSameSale =
        row !== null &&
        row.consumed_order !== null &&
        row.consumed_order.startsWith(sameOrder) &&
        row.sale_fingerprint === saleFingerprint &&
        Number(row.approved_reduction) >= reduction - APPROVAL_TOLERANCE
      return isSameSale ? toConsumed(row) : null
    },

    async idsUsedElsewhere({ tenantId, idNumbers, externalOrderId, sinceIso }) {
      if (idNumbers.length === 0) return new Set()
      const { data, error } = await db
        .from('gov_discount_claims')
        .select('id_number')
        .eq('tenant_id', tenantId)
        .eq('event', 'granted')
        .in('id_number', [...idNumbers])
        .neq('external_order_id', externalOrderId)
        .gte('occurred_at', sinceIso)
        .limit(200)
      if (error) fail('id reuse', error.message)
      return new Set((data ?? []).map((row) => row.id_number))
    },

    async listActiveGrants(tenantId, backend, externalOrderId) {
      const { data, error } = await db
        .from('gov_discount_claims')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('backend', backend)
        .eq('external_order_id', externalOrderId)
        .limit(500)
      if (error) fail('active grants', error.message)
      const rows = (data ?? []) as unknown as (ClaimRow & { id: string; created_at: string })[]
      const reversedKeys = new Set(
        rows.filter((row) => row.event === 'reversed').map((row) => `${row.revision}|${row.claimant_ref}`),
      )
      return rows
        .filter((row) => row.event === 'granted' && !reversedKeys.has(`${row.revision}|${row.claimant_ref}`))
        .map(
          (row): ActiveGrant => ({
            revision: row.revision,
            claimantRef: row.claimant_ref,
            row: withoutDatabaseKeys(row),
          }),
        )
    },

    async highestRevision(tenantId, backend, externalOrderId) {
      const { data, error } = await db
        .from('gov_discount_claims')
        .select('revision')
        .eq('tenant_id', tenantId)
        .eq('backend', backend)
        .eq('external_order_id', externalOrderId)
        .order('revision', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) fail('highest revision', error.message)
      return data ? Number(data.revision) : null
    },

    async insertClaims(rows) {
      if (rows.length === 0) return 0
      const { data, error } = await db
        .from('gov_discount_claims')
        .upsert(rows as unknown as Database['public']['Tables']['gov_discount_claims']['Insert'][], {
          onConflict: LEDGER_CONFLICT_KEY,
          ignoreDuplicates: true,
        })
        .select('id')
      if (error) fail('insert', error.message)
      return data?.length ?? 0
    },
  }
}
