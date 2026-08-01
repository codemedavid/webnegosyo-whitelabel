'use server'

/**
 * Superadmin-only writes: marking a client paid, and setting their allowances.
 *
 * Authorization is checked HERE, read from the caller's own session, and never
 * from an argument — a `tenantId` supplied by the client says nothing about who
 * is calling. Same arrangement as `denyUnlessOutletManager` in the outlets
 * actions.
 *
 * The RLS policy is superadmin-only too, so this is belt and braces. That is
 * deliberate: this is the one surface where a mistake lets a merchant grant
 * themselves unlimited free service, and every tenant admin — branch managers
 * included — is `role='admin'`, so there is no role string to fall back on.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseSubscriptionStore } from '@/lib/billing/subscription-repository'
import { markPaid } from '@/lib/billing/subscription-service'
import { pauseSubscription, resumeSubscription } from '@/lib/billing/subscription-lifecycle'
import { resolveOutletLimit, resolveStaffLimit } from '@/lib/billing/subscription-status'

const NOT_ALLOWED = 'Only a platform superadmin can manage subscriptions.'

function fail(error: unknown, fallback: string) {
  return { success: false as const, error: error instanceof Error ? error.message : fallback }
}

/**
 * The signed-in superadmin's id, or null.
 *
 * Returns the id rather than a boolean because the payment ledger records who
 * wrote the row — an unattributed payment is one nobody can question later.
 */
async function requireSuperadmin(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('app_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data || data.role !== 'superadmin') return null
  return user.id
}

export interface MarkPaidActionInput {
  tenantId: string
  amountPhp?: number
  periodMonths?: number
  method?: string
  reference?: string
  note?: string
}

/** Records a payment and extends the tenant's access. */
export async function markTenantPaidAction(input: MarkPaidActionInput) {
  const superadminId = await requireSuperadmin()
  if (!superadminId) return { success: false as const, error: NOT_ALLOWED }

  try {
    const store = createSupabaseSubscriptionStore(createAdminClient())
    const result = await markPaid(
      store,
      { ...input, recordedBy: superadminId },
      new Date().toISOString()
    )

    revalidatePath('/superadmin/subscriptions')
    return { success: true as const, data: result }
  } catch (error) {
    return fail(error, 'Failed to record the payment')
  }
}

/**
 * Cuts a tenant off, or lets them back in.
 *
 * Takes a boolean rather than a status string so the client can never name a
 * status of its own — `cancelled`, or a typo the CHECK constraint rejects at
 * the very moment the owner is trying to stop a store trading.
 *
 * Revalidates the tenant's own admin path as well as this screen: the gate is
 * read on that layout, and leaving it cached would keep a just-paused merchant
 * working until their page happened to expire.
 */
export async function setTenantPausedAction(tenantId: string, isPaused: boolean) {
  const superadminId = await requireSuperadmin()
  if (!superadminId) return { success: false as const, error: NOT_ALLOWED }

  try {
    const store = createSupabaseSubscriptionStore(createAdminClient())

    if (isPaused) {
      await pauseSubscription(store, { tenantId })
    } else {
      await resumeSubscription(store, { tenantId })
    }

    revalidatePath('/superadmin/subscriptions')
    revalidatePath(`/superadmin/tenants/${tenantId}`)
    revalidatePath('/[tenant]/admin', 'layout')
    return { success: true as const }
  } catch (error) {
    return fail(error, isPaused ? 'Failed to pause the tenant' : 'Failed to resume the tenant')
  }
}

/**
 * Sets a tenant's branch and seat allowances.
 *
 * Lowering an allowance below what the tenant already holds is ALLOWED and
 * takes nothing away — the caps bite on create only. Refusing the edit would
 * mean a client downgrading their plan could never be moved onto it.
 */
export async function updateTenantLimitsAction(
  tenantId: string,
  limits: { maxOutlets?: number; maxStaffPerBranch?: number }
) {
  const superadminId = await requireSuperadmin()
  if (!superadminId) return { success: false as const, error: NOT_ALLOWED }

  try {
    const patch: Record<string, number> = {}
    if (limits.maxOutlets !== undefined) {
      patch.max_outlets = resolveOutletLimit({ max_outlets: limits.maxOutlets })
    }
    if (limits.maxStaffPerBranch !== undefined) {
      patch.max_staff_per_branch = resolveStaffLimit({
        max_staff_per_branch: limits.maxStaffPerBranch,
      })
    }

    if (Object.keys(patch).length === 0) {
      return { success: true as const }
    }

    const { error } = await createAdminClient().from('tenants').update(patch).eq('id', tenantId)
    if (error) throw new Error(error.message)

    revalidatePath('/superadmin/subscriptions')
    revalidatePath(`/superadmin/tenants/${tenantId}`)
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to update the allowances')
  }
}
