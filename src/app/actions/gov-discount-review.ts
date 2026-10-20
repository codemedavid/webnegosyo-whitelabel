'use server'

/**
 * Marking a Senior/PWD grant "OK" or "a problem".
 *
 * Written with the caller's cookie session: the `gov_discount_reviews` insert
 * policy requires `discount_review` and the stamp trigger records WHO reviewed
 * (never taken from the input). The claim is read first with the same session
 * because the review policy is store-wide while the ledger is branch-scoped —
 * a branch-locked reviewer must not file verdicts on another branch's grants.
 *
 * NOTE: no `export type { … }` in this file. A type re-export from a
 * `'use server'` module throws at build time while tsc and Jest stay green.
 */

import { revalidatePath } from 'next/cache'
import { verifyTenantPermission } from '@/lib/admin-service'
import { createClient } from '@/lib/supabase/server'
import { reviewInputSchema, type ReviewInput } from '@/lib/gov-discount-reports/review-schema'

export interface GovDiscountReviewResult {
  success: boolean
  error?: string
}

function isAuthError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Unauthorized')
}

export async function reviewGovDiscountAction(input: ReviewInput): Promise<GovDiscountReviewResult> {
  const parsed = reviewInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Check the review and try again.' }
  }
  const { tenantId, tenantSlug, claimId, verdict, note } = parsed.data

  try {
    await verifyTenantPermission(tenantId, 'discount_review', 'edit')
  } catch (error) {
    if (isAuthError(error)) return { success: false, error: 'Only owners and managers can review discounts.' }
    console.error('[gov-discount-review] access check failed', error)
    return { success: false, error: 'We could not check your access. Please try again.' }
  }

  const supabase = await createClient()

  const { data: claim, error: claimError } = await supabase
    .from('gov_discount_claims')
    .select('id')
    .eq('id', claimId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (claimError) {
    console.error('[gov-discount-review] claim read failed', claimError.message)
    return { success: false, error: 'We could not save the review. Please try again.' }
  }
  if (!claim) return { success: false, error: 'That discount is no longer in your sales book.' }

  // RLS refusals are silent: insist on getting the row back.
  const { data: review, error } = await supabase
    .from('gov_discount_reviews')
    .insert({ tenant_id: tenantId, claim_id: claimId, verdict, note })
    .select('id')
    .maybeSingle()
  if (error || !review) {
    console.error('[gov-discount-review] insert failed', error?.message ?? 'no row returned')
    return { success: false, error: 'We could not save the review. Please try again.' }
  }

  revalidatePath(`/${tenantSlug}/admin/gov-discounts`)
  return { success: true }
}
