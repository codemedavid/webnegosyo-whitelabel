'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { assertOutletCapacity, OutletNotFoundError } from '@/lib/outlets/outlet-repository'
import type { OutletPatch, OutletWriteInput } from '@/lib/outlets/outlet-repository'
import { resolveOutletLimit } from '@/lib/billing/subscription-status'
import { canManageOutlets } from '@/lib/outlets/branch-scope'
import {
  asAppUserQueryClient,
  fetchAppUserScope,
} from '@/lib/queries/fetch-app-user-scope'
import { isStorePinRequired, validateStorePin } from '@/lib/delivery/store-pin-rules'
import { isUuid } from '@/lib/uuid'

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

/**
 * How many branches this tenant may hold.
 *
 * A read that SUCCEEDS and finds nothing set falls back to the platform
 * default rather than to unlimited: an unconfigured allowance must not become
 * a way to mint branches.
 *
 * A read that FAILS is a different thing entirely and must not be folded into
 * that same answer. `resolveOutletLimit(null)` returns the default of 1, so a
 * transient error — or deploying to an environment where `20260808130000` has
 * not landed and `max_outlets` does not exist at all, a class of drift this
 * platform has shipped more than once — told every multi-branch tenant "This
 * plan includes 1 branch. Contact support to add more." A tenant legitimately
 * running five branches would read that as their plan being downgraded.
 *
 * So it throws, and the merchant is told the truth: the allowance could not be
 * read. Still fails closed — no branch is created — but it stops the product
 * from stating a limit that is not the merchant's.
 */
async function fetchOutletLimit(tenantId: string): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('max_outlets')
    .eq('id', tenantId)
    .maybeSingle()

  if (error) {
    console.error('[outlets] Branch allowance read failed', tenantId, error)
    throw new Error(
      'Could not check how many branches your plan includes. Please try again.'
    )
  }

  return resolveOutletLimit(data as { max_outlets?: number | null } | null)
}

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

interface BranchPinFields {
  latitude?: number | null
  longitude?: number | null
  supports_delivery?: boolean
}

/**
 * The pickup-pin rules (`store-pin-rules.ts`) for a branch save.
 *
 * A branch's pin is its Lalamove pickup and the point its delivery fees are
 * measured from. Required only for a DELIVERING branch of a store that books
 * Lalamove or prices by distance: a pickup-only branch has nothing to measure,
 * and an unpinned delivering branch would fall back to the main store's pin
 * (`resolveDeliveryOrigin`) and send its riders there.
 *
 * The check judges the branch as it will be AFTER the save: a patch's own
 * fields over the stored row (`stored`, null on a create). So clearing the pin
 * of a branch that still delivers, or switching delivery on for one that was
 * never pinned, is refused even though the patch names only one of the two.
 * A missing `supports_delivery` on a create counts as delivering, like the
 * column default. A patch that touches neither the pin nor delivery is not
 * checked (and costs no read).
 *
 * The store's market and delivery settings are read here, never trusted from
 * the client; a failed read refuses the save.
 */
async function denyUnlessBranchPinValid(
  tenantId: string,
  fields: BranchPinFields,
  stored: BranchPinFields | null,
): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('lalamove_enabled, lalamove_market, distance_delivery_enabled')
    .eq('id', tenantId)
    .maybeSingle()
  if (error || !data) {
    console.error('[outlets] Branch pin check: store read failed', tenantId, error)
    return 'Could not check your delivery settings. Please try again.'
  }

  const store = data as {
    lalamove_enabled?: boolean | null
    lalamove_market?: string | null
    distance_delivery_enabled?: boolean | null
  }
  // Half a pin in the patch is judged as sent (and refused), never completed from the stored half.
  const touchesPin = fields.latitude !== undefined || fields.longitude !== undefined
  const pin = touchesPin ? fields : (stored ?? {})
  const isDelivering = (fields.supports_delivery ?? stored?.supports_delivery) !== false
  return validateStorePin({
    lat: pin.latitude,
    lng: pin.longitude,
    market: store.lalamove_market,
    lalamoveEnabled: store.lalamove_enabled,
    isPinRequired: isDelivering && isStorePinRequired(store),
    subject: 'branch',
  })
}

const BRANCH_NOT_FOUND = new OutletNotFoundError().message

/** The stored pin and delivery switch a patch is applied over. A failed read refuses the save. */
async function readStoredBranchPin(
  tenantId: string,
  outletId: string,
): Promise<{ ok: true; branch: BranchPinFields } | { ok: false; error: string }> {
  try {
    const branch = await createSupabaseOutletRepository().findById(tenantId, outletId)
    if (!branch) return { ok: false, error: BRANCH_NOT_FOUND }
    return { ok: true, branch }
  } catch (error) {
    console.error('[outlets] Branch pin check: branch read failed', { tenantId, outletId, error })
    return { ok: false, error: 'Could not check this branch. Please try again.' }
  }
}

function touchesBranchPin(fields: BranchPinFields): boolean {
  return fields.latitude !== undefined || fields.longitude !== undefined || fields.supports_delivery !== undefined
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
    // The branch allowance, enforced here rather than in the repository because
    // this is the only path that creates one and the count is a query the
    // repository would otherwise have to make on every write.
    const repository = createSupabaseOutletRepository()
    const existing = await repository.listByTenant(tenantId)
    assertOutletCapacity(existing.length, await fetchOutletLimit(tenantId))

    // After the allowance: a store at its limit hears that first.
    const pinError = await denyUnlessBranchPinValid(tenantId, input, null)
    if (pinError) return { success: false as const, error: pinError }

    const data = await repository.create(tenantId, input)
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

  if (!isUuid(outletId)) return { success: false as const, error: BRANCH_NOT_FOUND }

  if (touchesBranchPin(patch)) {
    const stored = await readStoredBranchPin(tenantId, outletId)
    if (!stored.ok) return { success: false as const, error: stored.error }
    const pinError = await denyUnlessBranchPinValid(tenantId, patch, stored.branch)
    if (pinError) return { success: false as const, error: pinError }
  }

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
