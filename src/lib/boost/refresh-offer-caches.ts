import { revalidatePath } from 'next/cache'
import { invalidateComplementaryPairsCache } from '@/lib/complementary-pairs-service'
import { invalidateCheckoutUpsellCache } from '@/lib/menu-engineering-service'
import { invalidateBundlesCache } from '@/lib/bundles-service'
import { revalidateStorefront, revalidateStorefrontMenu } from '@/lib/storefront/revalidate'

/** Every offer surface reads through these caches; clear them together after any offer write. */
export async function refreshOfferCaches(tenantId: string, tenantSlug: string): Promise<void> {
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
