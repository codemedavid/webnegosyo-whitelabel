'use server'

import { z } from 'zod'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ReceiptTaxIdentity } from '@/lib/receipt-tax'
import { readReceiptTaxIdentity } from '@/lib/receipt-tax-server'
import { defineAction } from '@/platform/http/define-action'

interface ReceiptContext {
  storeName: string
  receiptLayout: unknown
  /** TIN header, VAT block and footer; null when the store has no Tax & discounts profile. */
  tax: ReceiptTaxIdentity | null
}

interface SaveReceiptLayoutResult {
  success: boolean
  error?: string
}

/**
 * Publish a tenant's receipt layout (a preset name or a custom block stack).
 * Refuses anything `sanitizeLayoutForSave` cannot vouch for — the printer
 * silently falls back to Classic on invalid data, so a bad save would throw
 * the merchant's design away without telling them.
 */
export const saveReceiptLayoutAction = defineAction({
  auth: { kind: 'staff', permission: 'store_setup', branch: 'any', storeClaim: ([tenantId]) => tenantId },
  // Typed, not validated here: the access check decides the store id, and
  // `sanitizeLayoutForSave` is the check on the layout.
  args: [z.custom<string>(), z.unknown()],
  // This action has always answered every refusal and failure with one sentence.
  onRefusal: (): SaveReceiptLayoutResult => ({ success: false, error: 'Not authorized' }),
  handler: async ({ tenant, args: [, layout] }): Promise<SaveReceiptLayoutResult> => {
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
      .eq('id', tenant)

    if (error) return { success: false, error: 'Could not save' }
    return { success: true }
  },
})

/**
 * What the admin's "Print receipt" needs from the tenant row: the store name
 * and the saved receipt layout. Fetched on demand when the button is clicked
 * rather than threaded through every orders wrapper — the layout must always
 * be the currently-published one, not a page-load snapshot.
 */
export async function getReceiptContext(tenantId: string): Promise<ReceiptContext | null> {
  try {
    await verifyTenantAdmin(tenantId, 'view')

    const admin = createAdminClient()
    const [{ data }, tax] = await Promise.all([
      admin.from('tenants').select('name, receipt_layout').eq('id', tenantId).maybeSingle(),
      readReceiptTaxIdentity(tenantId),
    ])

    const row = data as { name?: string; receipt_layout?: unknown } | null
    if (!row?.name) return null
    return { storeName: row.name, receiptLayout: row.receipt_layout ?? null, tax }
  } catch {
    return null
  }
}
