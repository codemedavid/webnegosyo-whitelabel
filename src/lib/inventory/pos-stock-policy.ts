/**
 * What the register does when a sale asks for more than the shelf holds —
 * `tenants.pos_stock_policy` (migration 20261104150000).
 *
 *   'warn'  (default) the cashier is told and may sell anyway (today's behaviour)
 *   'block' selling past the stock needs a manager PIN
 *
 * CONTRACT with the register: `GET /api/inventory/ceilings` answers
 * `stockPolicy: 'warn' | 'block'`, and the app session may read the column
 * `tenants.pos_stock_policy` directly. Anything unreadable is 'warn': a failed
 * stock read never blocks a sale.
 *
 * The web checkout never reads this — it always refuses what it cannot make.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export const POS_STOCK_POLICIES = ['warn', 'block'] as const
export type PosStockPolicy = (typeof POS_STOCK_POLICIES)[number]
export const DEFAULT_POS_STOCK_POLICY: PosStockPolicy = 'warn'

export function toPosStockPolicy(value: unknown): PosStockPolicy {
  return value === 'block' ? 'block' : DEFAULT_POS_STOCK_POLICY
}

/** The caller fields the database guard looks at. */
export interface PosStockPolicyCaller {
  role: string
  tenant_id: string | null
  is_owner?: boolean | null
  outlet_id?: string | null
}

/**
 * Who may change it — the mirror of `guard_tenant_pos_stock_policy`: the
 * store's own owner on a store-wide account, or a superadmin. It is the rule
 * that polices cashiers, so a staff account must not switch its own PIN off.
 */
export function canChangePosStockPolicy(caller: PosStockPolicyCaller | null | undefined, tenantId: string): boolean {
  if (!caller) return false
  if (caller.role === 'superadmin') return true
  return caller.role === 'admin' && caller.tenant_id === tenantId && caller.is_owner === true && !caller.outlet_id
}

/** The column is not in the generated types until the migration is applied. */
interface PolicyRowReader {
  from(table: 'tenants'): {
    select(columns: 'pos_stock_policy'): {
      eq(column: 'id', value: string): {
        maybeSingle(): PromiseLike<{ data: { pos_stock_policy?: unknown } | null; error: unknown }>
      }
    }
  }
}

/** The store's policy, read fresh (never from the tenant cache). Never throws. */
export async function readPosStockPolicy(tenantId: string): Promise<PosStockPolicy> {
  try {
    const db = createAdminClient() as unknown as PolicyRowReader
    const { data, error } = await db.from('tenants').select('pos_stock_policy').eq('id', tenantId).maybeSingle()
    if (error) {
      console.error('[inventory] POS stock policy read failed — using warn', tenantId, error)
      return DEFAULT_POS_STOCK_POLICY
    }
    return toPosStockPolicy(data?.pos_stock_policy)
  } catch (error) {
    console.error('[inventory] POS stock policy read failed — using warn', tenantId, error)
    return DEFAULT_POS_STOCK_POLICY
  }
}
