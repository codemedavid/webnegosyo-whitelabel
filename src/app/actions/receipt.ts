'use server'

import { verifyTenantAdmin } from '@/lib/admin-service'
import { createAdminClient } from '@/lib/supabase/admin'

interface ReceiptContext {
  storeName: string
  receiptLayout: unknown
}

/**
 * What the admin's "Print receipt" needs from the tenant row: the store name
 * and the saved receipt layout. Fetched on demand when the button is clicked
 * rather than threaded through every orders wrapper — the layout must always
 * be the currently-published one, not a page-load snapshot.
 */
export async function getReceiptContext(tenantId: string): Promise<ReceiptContext | null> {
  try {
    await verifyTenantAdmin(tenantId)

    const admin = createAdminClient()
    const { data } = await admin
      .from('tenants')
      .select('name, receipt_layout')
      .eq('id', tenantId)
      .maybeSingle()

    const row = data as { name?: string; receipt_layout?: unknown } | null
    if (!row?.name) return null
    return { storeName: row.name, receiptLayout: row.receipt_layout ?? null }
  } catch {
    return null
  }
}
