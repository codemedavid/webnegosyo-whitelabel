'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { invalidateComplementaryPairsCache } from '@/lib/complementary-pairs-service'
import { deleteUpsellPair, invalidateCheckoutUpsellCache, updateUpsellPair } from '@/lib/menu-engineering-service'
import {
  createBundle,
  deleteBundle,
  invalidateBundlesCache,
  toggleBundleActive,
  updateBundle,
  type BundleInput,
} from '@/lib/bundles-service'
import { invalidateTenantCache } from '@/lib/cache'
import { revalidateStorefront, revalidateStorefrontMenu } from '@/lib/storefront/revalidate'
import {
  deleteBoostPairing,
  saveBoostLastCall,
  saveBoostPairing,
  saveBoostUpgrade,
  setBoostEnabled,
  setBoostPairingActive,
  type LastCallSaveInput,
  type PairingSaveInput,
  type UpgradeSaveInput,
} from '@/lib/boost/writes'

// No `export type` here: a type re-export from a 'use server' file passes
// dev and tsc but breaks `next build`. Input types live in @/lib/boost/writes.

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? fallback
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/** Every offer surface reads through these caches; clear them together. */
async function refreshOfferCaches(tenantId: string, tenantSlug: string): Promise<void> {
  await Promise.all([
    invalidateComplementaryPairsCache(tenantId),
    invalidateCheckoutUpsellCache(tenantId),
    invalidateBundlesCache(tenantId),
  ])
  // The cached public menu (combo cards) is keyed by slug, product pages by id.
  revalidateStorefront({ slug: tenantSlug, id: tenantId })
  revalidatePath(`/${tenantSlug}/admin/boost-sales`)
  revalidateStorefrontMenu(tenantSlug)
}

async function run<T>(
  tenantId: string,
  tenantSlug: string,
  fallback: string,
  write: () => Promise<T>,
  { refreshTenant = false }: { refreshTenant?: boolean } = {}
): Promise<ActionResult<T>> {
  try {
    const data = await write()
    if (refreshTenant) await invalidateTenantCache(tenantSlug, tenantId)
    await refreshOfferCaches(tenantId, tenantSlug)
    return { success: true, data }
  } catch (error) {
    console.error(`[boost] ${fallback}:`, error)
    return { success: false, error: errorMessage(error, fallback) }
  }
}

export async function setBoostEnabledAction(
  tenantId: string,
  tenantSlug: string,
  enabled: boolean
): Promise<ActionResult> {
  const result = await run(tenantId, tenantSlug, 'Could not update Boost Sales', async () => {
    await setBoostEnabled(tenantId, enabled)
    return undefined
  }, { refreshTenant: true })
  // The sidebar reads the flag in the admin layout.
  if (result.success) revalidatePath(`/${tenantSlug}/admin`, 'layout')
  return result
}

export async function saveBoostPairingAction(
  tenantId: string,
  tenantSlug: string,
  input: PairingSaveInput
): Promise<ActionResult> {
  return run(tenantId, tenantSlug, 'Could not save this pairing', async () => {
    await saveBoostPairing(tenantId, input)
    return undefined
  })
}

export async function setBoostPairingActiveAction(
  tenantId: string,
  tenantSlug: string,
  sourceIds: string[],
  isActive: boolean
): Promise<ActionResult> {
  return run(tenantId, tenantSlug, 'Could not update this pairing', async () => {
    await setBoostPairingActive(tenantId, sourceIds, isActive)
    return undefined
  })
}

export async function deleteBoostPairingAction(
  tenantId: string,
  tenantSlug: string,
  sourceIds: string[]
): Promise<ActionResult> {
  return run(tenantId, tenantSlug, 'Could not delete this pairing', async () => {
    await deleteBoostPairing(tenantId, sourceIds)
    return undefined
  })
}

export async function saveBoostUpgradeAction(
  tenantId: string,
  tenantSlug: string,
  input: UpgradeSaveInput
): Promise<ActionResult<string>> {
  return run(tenantId, tenantSlug, 'Could not save this upgrade', () => saveBoostUpgrade(tenantId, input))
}

export async function saveBoostLastCallAction(
  tenantId: string,
  tenantSlug: string,
  input: LastCallSaveInput
): Promise<ActionResult> {
  return run(tenantId, tenantSlug, 'Could not save the cart offer', async () => {
    await saveBoostLastCall(tenantId, input)
    return undefined
  }, { refreshTenant: true })
}

/**
 * Combos save through here rather than the older bundle actions so the cached
 * public menu is refreshed too — those only cleared Redis, so a new combo
 * stayed invisible on the menu until the storefront cache expired.
 */
export async function saveBoostComboAction(
  tenantId: string,
  tenantSlug: string,
  comboId: string | null,
  input: BundleInput
): Promise<ActionResult<string>> {
  return run(tenantId, tenantSlug, 'Could not save this combo', async () => {
    const saved = comboId
      ? await updateBundle(comboId, tenantId, input)
      : await createBundle(tenantId, input)
    return saved.id
  })
}

export async function setBoostComboActiveAction(
  tenantId: string,
  tenantSlug: string,
  comboId: string,
  isActive: boolean
): Promise<ActionResult> {
  return run(tenantId, tenantSlug, 'Could not update this combo', async () => {
    await toggleBundleActive(comboId, tenantId, isActive)
    return undefined
  })
}

export async function deleteBoostComboAction(
  tenantId: string,
  tenantSlug: string,
  comboId: string
): Promise<ActionResult> {
  return run(tenantId, tenantSlug, 'Could not delete this combo', async () => {
    await deleteBundle(comboId, tenantId)
    return undefined
  })
}

export async function setBoostUpgradeActiveAction(
  tenantId: string,
  tenantSlug: string,
  upgradeId: string,
  isActive: boolean
): Promise<ActionResult> {
  return run(tenantId, tenantSlug, 'Could not update this upgrade', async () => {
    await updateUpsellPair(upgradeId, tenantId, { is_active: isActive })
    return undefined
  })
}

export async function deleteBoostUpgradeAction(
  tenantId: string,
  tenantSlug: string,
  upgradeId: string
): Promise<ActionResult> {
  return run(tenantId, tenantSlug, 'Could not delete this upgrade', async () => {
    await deleteUpsellPair(upgradeId, tenantId)
    return undefined
  })
}
