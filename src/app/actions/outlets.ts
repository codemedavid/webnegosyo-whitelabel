'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import type { OutletPatch, OutletWriteInput } from '@/lib/outlets/outlet-repository'
import { canManageOutlets } from '@/lib/outlets/branch-scope'
import {
  asAppUserQueryClient,
  fetchAppUserScope,
} from '@/lib/queries/fetch-app-user-scope'

/**
 * Server actions for the branches admin.
 *
 * Tenant authorization is the outlets RLS policy: the repository uses the
 * cookie-scoped Supabase client, so a write only lands if the caller is a
 * superadmin or an admin of that exact tenant. Same arrangement as the
 * order-types and payment-methods actions.
 *
 * The BRANCH half cannot be left to that policy, because that policy is exactly
 * what was too permissive: a branch manager is `role='admin'`, so the tenant
 * grant reached them and they could rename or deactivate branches they do not
 * run. So writes check the caller's own scope here as well — read from their
 * session, never from an argument, since a `tenantId` supplied by the client
 * says nothing about who is calling.
 *
 * Reads stay ungated: the branch picker and every order screen list branches.
 */

const outletsPath = (slug: string) => `/${slug}/admin/outlets`

function fail(error: unknown, fallback: string) {
  return { success: false as const, error: error instanceof Error ? error.message : fallback }
}

const NOT_ALLOWED =
  'Only a store-wide admin can manage branches. Ask the store owner to make this change.'

/**
 * Refuse unless the signed-in account may manage branches.
 *
 * Returns an error string, or null when the write may proceed. A caller with no
 * admin row is refused: an unauthenticated request must not fall through to RLS
 * with the benefit of the doubt.
 */
async function denyUnlessOutletManager(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NOT_ALLOWED

  const { appUser, error } = await fetchAppUserScope(asAppUserQueryClient(supabase), user.id)
  if (error) return 'Could not verify your access. Please try again.'
  if (!appUser) return NOT_ALLOWED

  return canManageOutlets(appUser) ? null : NOT_ALLOWED
}

export async function listOutletsAction(tenantId: string) {
  try {
    const data = await createSupabaseOutletRepository().listByTenant(tenantId)
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to load branches')
  }
}

export async function createOutletAction(
  tenantId: string,
  tenantSlug: string,
  input: OutletWriteInput
) {
  const denied = await denyUnlessOutletManager()
  if (denied) return { success: false as const, error: denied }

  try {
    const data = await createSupabaseOutletRepository().create(tenantId, input)
    revalidatePath(outletsPath(tenantSlug))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to create branch')
  }
}

export async function updateOutletAction(
  tenantId: string,
  tenantSlug: string,
  outletId: string,
  patch: OutletPatch
) {
  const denied = await denyUnlessOutletManager()
  if (denied) return { success: false as const, error: denied }

  try {
    const data = await createSupabaseOutletRepository().update(tenantId, outletId, patch)
    revalidatePath(outletsPath(tenantSlug))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to update branch')
  }
}

/**
 * Deactivation, not deletion. Orders reference outlets, and a merchant closing
 * a branch for the season should not lose that history or the row's settings.
 */
export async function setOutletActiveAction(
  tenantId: string,
  tenantSlug: string,
  outletId: string,
  isActive: boolean
) {
  return updateOutletAction(tenantId, tenantSlug, outletId, { is_active: isActive })
}

export async function reorderOutletsAction(
  tenantId: string,
  tenantSlug: string,
  orderedIds: string[]
) {
  const denied = await denyUnlessOutletManager()
  if (denied) return { success: false as const, error: denied }

  try {
    await createSupabaseOutletRepository().reorder(tenantId, orderedIds)
    revalidatePath(outletsPath(tenantSlug))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to reorder branches')
  }
}
