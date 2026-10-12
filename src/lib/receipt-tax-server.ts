import 'server-only'

/**
 * The store's tax identity for the receipts the web prints and previews.
 *
 * Service role, after the caller's own gate: the browser print and the Studio
 * already checked the viewer belongs to the store. Every failure reads as "no
 * profile", so a slow or broken read prints the receipt the store always had
 * rather than no receipt.
 */

import { TAX_PROFILE_COLUMNS, taxProfileFromRow } from '@/lib/gov-discount'
import { ADMIN_QUERY_TIMEOUT_MS, createAdminClient } from '@/lib/supabase/admin'
import { receiptTaxIdentity, type ReceiptTaxIdentity } from '@/lib/receipt-tax'

export async function readReceiptTaxIdentity(tenantId: string): Promise<ReceiptTaxIdentity | null> {
  try {
    const admin = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const { data, error } = await admin
      .from('store_tax_profiles')
      .select(TAX_PROFILE_COLUMNS)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (error) {
      console.error('[receipt-tax] profile read failed:', error.message)
      return null
    }
    return receiptTaxIdentity(taxProfileFromRow(data)) ?? null
  } catch (error) {
    console.error('[receipt-tax] profile read threw:', error instanceof Error ? error.message : error)
    return null
  }
}
