'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import type { OutletPatch, OutletWriteInput } from '@/lib/outlets/outlet-repository'

/**
 * Server actions for the branches admin.
 *
 * Authorization is the outlets RLS policy, not a check written here: the
 * repository uses the cookie-scoped Supabase client, so a write only lands if
 * the caller is a superadmin or an admin of that exact tenant. Same arrangement
 * as the order-types and payment-methods actions.
 */

const outletsPath = (slug: string) => `/${slug}/admin/outlets`

function fail(error: unknown, fallback: string) {
  return { success: false as const, error: error instanceof Error ? error.message : fallback }
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
  try {
    await createSupabaseOutletRepository().reorder(tenantId, orderedIds)
    revalidatePath(outletsPath(tenantSlug))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to reorder branches')
  }
}
