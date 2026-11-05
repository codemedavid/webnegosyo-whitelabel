'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { createClient } from '@/lib/supabase/server'
import { canChangePosStockPolicy, POS_STOCK_POLICIES } from '@/lib/inventory/pos-stock-policy'

const inputSchema = z.object({
  tenantId: z.string().uuid(),
  tenantSlug: z.string().min(1).max(200),
  policy: z.enum(POS_STOCK_POLICIES),
})

const NOT_OWNER = 'Only the store owner can change this.'
const NOT_SAVED = 'This setting could not be saved. Please try again.'

/** The column is not in the generated types until its migration is applied. */
interface PolicyWriter {
  from(table: 'tenants'): {
    update(patch: { pos_stock_policy: string }): {
      eq(column: 'id', value: string): {
        select(columns: 'id'): PromiseLike<{ data: unknown[] | null; error: unknown }>
      }
    }
  }
}

type SetPosStockPolicyResult =
  | { success: true; policy: 'warn' | 'block' }
  | { success: false; error: string }

/**
 * Owner-only: what the register does when a sale asks for more than the shelf
 * holds. Written through the caller's own session, so the database guard
 * (`guard_tenant_pos_stock_policy`) is the boundary; an RLS refusal is zero
 * rows, so the rows are counted.
 */
export async function setPosStockPolicyAction(
  tenantId: string,
  tenantSlug: string,
  policy: 'warn' | 'block',
): Promise<SetPosStockPolicyResult> {
  const parsed = inputSchema.safeParse({ tenantId, tenantSlug, policy })
  if (!parsed.success) return { success: false, error: 'Choose one of the two options.' }

  try {
    const { userRole } = await verifyTenantAdmin(parsed.data.tenantId, 'edit')
    if (!canChangePosStockPolicy(userRole, parsed.data.tenantId)) return { success: false, error: NOT_OWNER }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : NOT_OWNER }
  }

  const db = (await createClient()) as unknown as PolicyWriter
  const { data, error } = await db
    .from('tenants')
    .update({ pos_stock_policy: parsed.data.policy })
    .eq('id', parsed.data.tenantId)
    .select('id')
  if (error || !data || data.length !== 1) {
    console.error('[inventory] POS stock policy save refused', { tenantId: parsed.data.tenantId, error, rows: data?.length ?? 0 })
    return { success: false, error: NOT_SAVED }
  }

  revalidatePath(`/${parsed.data.tenantSlug}/admin/inventory`)
  return { success: true, policy: parsed.data.policy }
}
