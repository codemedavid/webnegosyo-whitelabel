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
/**
 * Publish a tenant's receipt layout (a preset name or a custom block stack).
 * Refuses anything `sanitizeLayoutForSave` cannot vouch for — the printer
 * silently falls back to Classic on invalid data, so a bad save would throw
 * the merchant's design away without telling them.
 */
export async function saveReceiptLayoutAction(
  tenantId: string,
  layout: unknown,
): Promise<{ success: boolean; error?: string }> {
  try {
    await verifyTenantAdmin(tenantId)

    const { sanitizeLayoutForSave } = await import('@/lib/receipt-editor')
    const sanitized = sanitizeLayoutForSave(layout)
    if (sanitized === null) {
      return { success: false, error: 'Invalid receipt layout' }
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('tenants')
      // Structured-clone through JSON: ReceiptLayout is a closed interface and
      // the generated Json type wants an index signature.
      .update({ receipt_layout: JSON.parse(JSON.stringify(sanitized)) })
      .eq('id', tenantId)

    if (error) return { success: false, error: 'Could not save' }
    return { success: true }
  } catch {
    return { success: false, error: 'Not authorized' }
  }
}

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
