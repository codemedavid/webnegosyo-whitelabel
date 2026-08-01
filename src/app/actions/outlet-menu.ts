'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseOutletMenuRepository } from '@/lib/outlets/supabase-outlet-menu-repository'
import type { OutletMenuOverridePatch } from '@/lib/outlets/outlet-menu-repository'
import { canManageBranchMenu } from '@/lib/outlets/branch-scope'
import {
  asAppUserQueryClient,
  fetchAppUserScope,
} from '@/lib/queries/fetch-app-user-scope'

/**
 * Server actions for per-branch menus and prices.
 *
 * Tenant authorization is the `outlet_menu_items` RLS policy — the repository
 * uses the cookie-scoped client, so nothing lands for a caller who is not an
 * admin of that tenant. The BRANCH half is checked here as well, because the
 * account's own branch is read from its session and a `tenantId` or `outletId`
 * supplied by the browser says nothing about who is calling.
 *
 * Unlike `outlets.ts`, a branch-scoped admin IS allowed through — for its own
 * branch. Taking a sold-out dish off your own board is the point.
 */

const menuPath = (slug: string) => `/${slug}/admin/menu`
const outletsPath = (slug: string) => `/${slug}/admin/outlets`
const storefrontPath = (slug: string) => `/${slug}/menu`

function fail(error: unknown, fallback: string) {
  return { success: false as const, error: error instanceof Error ? error.message : fallback }
}

const NOT_ALLOWED =
  'You can only change the menu of a branch you manage. Ask the store owner to make this change.'

/** Refuse unless the signed-in account may change this branch's menu. */
async function denyUnlessBranchMenuManager(outletId: string): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NOT_ALLOWED

  const { appUser, error } = await fetchAppUserScope(asAppUserQueryClient(supabase), user.id)
  if (error) return 'Could not verify your access. Please try again.'
  if (!appUser) return NOT_ALLOWED

  return canManageBranchMenu(appUser, outletId) ? null : NOT_ALLOWED
}

/** Every override the tenant has — the admin's cross-branch views. */
export async function listOutletMenuOverridesAction(tenantId: string) {
  try {
    const data = await createSupabaseOutletMenuRepository().listByTenant(tenantId)
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to load branch menus')
  }
}

/** One branch's whole opinion — its Menu tab. */
export async function listOutletMenuForOutletAction(tenantId: string, outletId: string) {
  try {
    const data = await createSupabaseOutletMenuRepository().listByOutlet(tenantId, outletId)
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to load this branch menu')
  }
}

/**
 * Change one branch's opinion about one dish.
 *
 * A patch that leaves the branch identical to the store-wide menu removes the
 * row and returns null data — the branch is back to inheriting, which is a
 * successful outcome, not a failed write.
 */
export async function saveOutletMenuOverrideAction(
  tenantId: string,
  tenantSlug: string,
  outletId: string,
  menuItemId: string,
  patch: OutletMenuOverridePatch
) {
  const denied = await denyUnlessBranchMenuManager(outletId)
  if (denied) return { success: false as const, error: denied }

  try {
    const data = await createSupabaseOutletMenuRepository().save(
      tenantId,
      outletId,
      menuItemId,
      patch
    )
    revalidatePath(menuPath(tenantSlug))
    revalidatePath(outletsPath(tenantSlug))
    // The storefront is ISR-cached for five minutes; a price change the merchant
    // just made should be on the board before the next customer, not after it.
    revalidatePath(storefrontPath(tenantSlug))
    return { success: true as const, data }
  } catch (error) {
    return fail(error, 'Failed to save the branch menu')
  }
}

/** Return one dish at one branch to the store-wide menu outright. */
export async function clearOutletMenuOverrideAction(
  tenantId: string,
  tenantSlug: string,
  outletId: string,
  menuItemId: string
) {
  const denied = await denyUnlessBranchMenuManager(outletId)
  if (denied) return { success: false as const, error: denied }

  try {
    await createSupabaseOutletMenuRepository().clear(tenantId, outletId, menuItemId)
    revalidatePath(menuPath(tenantSlug))
    revalidatePath(outletsPath(tenantSlug))
    revalidatePath(storefrontPath(tenantSlug))
    return { success: true as const }
  } catch (error) {
    return fail(error, 'Failed to reset the branch menu')
  }
}
