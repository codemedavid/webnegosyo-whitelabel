'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { taxProfileToRow } from '@/lib/gov-discount'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { canManageStaff } from '@/lib/staff-permissions'
import { checkRateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { taxSettingsFormSchema } from '@/lib/tax-settings/form-schema'
import { profileFromFormValues } from '@/lib/tax-settings/form-mapping'
import { approvalPinFormSchema } from '@/lib/tax-settings/pin-schema'
import {
  OWNER_ONLY_MESSAGE,
  describeTaxSaveError,
  fieldErrorsFromIssues,
  type SaveTaxSettingsResult,
  type SetApprovalPinResult,
} from '@/lib/tax-settings/results'
import type { Database } from '@/types/database'

type TaxProfileInsert = Database['public']['Tables']['store_tax_profiles']['Insert']

const tenantIdSchema = z.string().uuid()
const PIN_BURST = { maxRequests: 10, windowMs: 60_000 }

function settingsPath(tenantSlug: string): string {
  return `/${encodeURIComponent(tenantSlug)}/admin/settings/tax`
}

async function signedInCaller(tenantId: string) {
  try {
    return await verifyTenantAdmin(tenantId)
  } catch {
    return null
  }
}

/**
 * Saves the store's tax profile. Written through the owner's OWN session so
 * row-level security is the gate (owner or superadmin only); an UPDATE that
 * RLS refuses changes nothing and says nothing, so the returned row count is
 * what proves the save.
 */
export async function saveTaxSettingsAction(
  tenantId: string,
  tenantSlug: string,
  input: unknown,
): Promise<SaveTaxSettingsResult> {
  if (!tenantIdSchema.safeParse(tenantId).success) {
    return { success: false, error: 'This store could not be found.' }
  }

  const parsed = taxSettingsFormSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
    }
  }

  const caller = await signedInCaller(tenantId)
  if (!caller) return { success: false, error: 'Please sign in again to save these settings.' }
  if (!canManageStaff(caller.userRole)) return { success: false, error: OWNER_ONLY_MESSAGE }

  const row: TaxProfileInsert = {
    tenant_id: tenantId,
    ...(taxProfileToRow(profileFromFormValues(parsed.data)) as Omit<TaxProfileInsert, 'tenant_id'>),
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('store_tax_profiles')
      .upsert(row, { onConflict: 'tenant_id' })
      .select('tenant_id')

    if (error) {
      console.error('[tax-settings] save failed:', error.code, error.message)
      return { success: false, error: describeTaxSaveError(error.code) }
    }
    if (!data || data.length !== 1) {
      return { success: false, error: OWNER_ONLY_MESSAGE }
    }
  } catch (error) {
    console.error('[tax-settings] save threw:', error instanceof Error ? error.message : error)
    return { success: false, error: describeTaxSaveError(undefined) }
  }

  revalidatePath(settingsPath(tenantSlug))
  return { success: true }
}

/**
 * The signed-in person sets their OWN approval PIN — never anyone else's: the
 * user comes from the session, not the request. Same service as the app's
 * `POST /api/gov-discounts/pin`, so the same people may hold one and the same
 * obvious PINs are refused.
 */
export async function setApprovalPinAction(tenantId: string, input: unknown): Promise<SetApprovalPinResult> {
  if (!tenantIdSchema.safeParse(tenantId).success) {
    return { success: false, error: 'This store could not be found.' }
  }

  const parsed = approvalPinFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Use 4 to 6 numbers.' }
  }

  const caller = await signedInCaller(tenantId)
  if (!caller) return { success: false, error: 'Please sign in again to set your PIN.' }

  if (!checkRateLimit(`gov-pin:${caller.user.id}`, PIN_BURST).allowed) {
    return { success: false, error: 'Too many tries. Wait a minute and try again.' }
  }

  try {
    const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
    const { createSupabaseApprovalStore } = await import('@/lib/gov-discount-ledger/supabase-approval-store')
    const { setOwnApprovalPin } = await import('@/lib/gov-discount-ledger/approval-service')

    const store = createSupabaseApprovalStore(createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }))
    const outcome = await setOwnApprovalPin(store, tenantId, caller.user.id, parsed.data.pin)
    return outcome.ok ? { success: true } : { success: false, error: outcome.error }
  } catch (error) {
    console.error('[tax-settings] set pin failed:', error instanceof Error ? error.message : error)
    return { success: false, error: 'Could not save the PIN. Try again.' }
  }
}
