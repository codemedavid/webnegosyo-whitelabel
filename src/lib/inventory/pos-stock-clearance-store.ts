/**
 * The service-role side of the register's stock clearance
 * (`pos-stock-clearance.ts`): the store's policy, the shelf judgement shared
 * with the web checkout, the manager PIN shared with Senior/PWD approvals,
 * and the one INSERT into `pos_stock_clearances` (service role only).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createSupabaseApprovalStore } from '@/lib/gov-discount-ledger/supabase-approval-store'
import { findCheckoutStockShortfalls } from '@/lib/inventory/checkout-stock-guard'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { checkPinTryLimits } from '@/lib/staff-pin/pin-limits'
import { PIN_TRIES_PER_CALLER_AND_RECEIVER } from '@/lib/cash/remittance-pin'
import type { ClearanceShortfall, ClearanceStore, StockClearanceLine } from './pos-stock-clearance'

type Db = SupabaseClient<Database>

/** Untyped until `src/types/database.ts` is regenerated after the migration. */
interface UntypedInsert {
  from(table: string): {
    insert(row: Record<string, unknown>): {
      select(columns: string): { single(): PromiseLike<{ data: { id: string } | null; error: { message: string } | null }> }
    }
  }
}

const UNNAMED_DISH = 'An item'

function toCartLine(line: StockClearanceLine) {
  const optionIds = line.optionIds ?? []
  const addonIds = line.addonIds ?? []
  // Exactly as /api/inventory/order-stock reads the register's items, so the
  // clearance judges what the deduction will spend.
  return {
    menuItemId: line.menuItemId,
    quantity: line.quantity,
    optionIds,
    addonIds,
    modifierOptionIds: [...new Set([...(line.modifierOptionIds ?? []), ...optionIds, ...addonIds])],
    ...(line.addonQuantities ? { addonQuantities: line.addonQuantities } : {}),
  }
}

export function createClearanceStore(db: Db): ClearanceStore {
  const approvals = createSupabaseApprovalStore(db)
  return {
    async readPolicy(tenantId) {
      const { data, error } = await db.from('tenants').select('pos_stock_policy').eq('id', tenantId).maybeSingle()
      if (error) throw new Error(`[pos-stock-clearance] policy: ${error.message}`)
      return (data as { pos_stock_policy?: string | null } | null)?.pos_stock_policy === 'block' ? 'block' : 'warn'
    },

    async judge(tenantId, outletId, lines): Promise<ClearanceShortfall[]> {
      const verdict = await findCheckoutStockShortfalls(tenantId, lines.map(toCartLine), outletId)
      if (!verdict) return []
      return verdict.shortfalls.map((shortfall) => {
        const dish = verdict.namesByMenuItemId.get(shortfall.menuItemId) ?? UNNAMED_DISH
        return {
          menuItemId: shortfall.menuItemId,
          name: shortfall.optionLabel ? `${dish} (${shortfall.optionLabel})` : dish,
          requested: shortfall.requested,
          producible: Math.max(0, shortfall.producible),
        }
      })
    },

    findAccount: approvals.findAccount,
    listAccounts: approvals.listAccounts,
    usersWithPins: approvals.usersWithPins,
    verifyPin: approvals.verifyPin,

    async allowPinTry(tenantId, callerUserId, approverUserId) {
      // The shared per-cashier and per-approver budgets, plus a tighter one per
      // (cashier, approver) kept below the database's five-try lock, so one
      // cashier cannot lock a manager out of every PIN screen on purpose.
      const [shared, pair] = await Promise.all([
        checkPinTryLimits(`pos-stock:cashier:${tenantId}:${callerUserId}`, tenantId, approverUserId),
        checkRateLimit(`pos-stock:pair:${tenantId}:${callerUserId}:${approverUserId}`, PIN_TRIES_PER_CALLER_AND_RECEIVER),
      ])
      return shared && pair.allowed
    },

    async insertClearance(row) {
      const { data, error } = await (db as unknown as UntypedInsert)
        .from('pos_stock_clearances')
        .insert({
          tenant_id: row.tenantId,
          outlet_id: row.outletId,
          order_id: row.orderId,
          cashier_user_id: row.cashierUserId,
          cashier_name: row.cashierName.slice(0, 200),
          approver_user_id: row.approverUserId,
          approver_name: row.approverName?.slice(0, 200) ?? null,
          quantities: row.quantities,
          shortfalls: row.shortfalls,
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(`[pos-stock-clearance] insert: ${error?.message ?? 'no row'}`)
      return { id: data.id }
    },
  }
}
