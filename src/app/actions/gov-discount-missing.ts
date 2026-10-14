'use server'

/**
 * "Record now" for an order whose Senior/PWD discount never reached the sales
 * book (`missing-service.ts`). The caller must review discounts; a
 * branch-locked reviewer may record only their own branch's orders. The record
 * is built from the STORED order and re-priced by the server — nothing here
 * takes an amount from the browser.
 *
 * NOTE: no `export type { … }` in this file (a type re-export from a
 * `'use server'` module breaks `next build`).
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { verifyTenantPermission } from '@/lib/admin-service'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'

export interface RecordMissingGovResult {
  success: boolean
  error?: string
}

const inputSchema = z
  .object({
    tenantId: z.string().uuid(),
    tenantSlug: z.string().min(1).max(100),
    orderId: z.string().uuid(),
  })
  .strict()

export async function recordMissingGovOrderAction(input: unknown): Promise<RecordMissingGovResult> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'That order could not be found.' }
  const { tenantId, tenantSlug, orderId } = parsed.data

  let caller: Awaited<ReturnType<typeof verifyTenantPermission>>
  try {
    caller = await verifyTenantPermission(tenantId, 'discount_review', 'edit')
  } catch {
    return { success: false, error: 'Only owners and managers who review discounts can do this.' }
  }

  try {
    const [{ createAdminClient, ADMIN_QUERY_TIMEOUT_MS }, { recordMissingOrder, RECORD_MISSING_MESSAGES }, { resolveLedgerActor }] =
      await Promise.all([
        import('@/lib/supabase/admin'),
        import('@/lib/gov-discount-ledger/missing-service'),
        import('@/lib/gov-discount-ledger/actor'),
      ])
    const db = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const actor = await resolveLedgerActor(db, tenantId, caller.user)
    const outcome = await recordMissingOrder(db, {
      tenantId,
      orderId,
      scope: resolveBranchScope(caller.userRole),
      actor,
      now: new Date(),
    })
    if (outcome !== 'recorded') return { success: false, error: RECORD_MISSING_MESSAGES[outcome] }
    revalidatePath(`/${tenantSlug}/admin/gov-discounts`)
    return { success: true }
  } catch (error) {
    console.error('[gov-discount-missing] record failed', { tenantId, orderId, error: error instanceof Error ? error.name : 'unknown' })
    return { success: false, error: 'We could not record it. Please try again.' }
  }
}
