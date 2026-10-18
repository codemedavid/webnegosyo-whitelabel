import { redirect } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getCategoriesByTenant, getMenuItemsByTenant } from '@/lib/admin-service'
import type { Category, MenuItem } from '@/types/database'
import { getProductDetailSettings } from '@/app/actions/product-detail-settings'
import { BrandingStudio } from '@/components/admin/branding-studio/branding-studio'
import { BRANDING_SURFACES, type BrandingSurface } from '@/lib/branding-registry'
import { pickPreviewItemId } from '@/lib/branding-studio/preview-item'

function surfaceFrom(value: string | string[] | undefined): BrandingSurface['id'] | undefined {
  return BRANDING_SURFACES.find((surface) => surface.id === value)?.id
}

export const metadata = {
  title: 'Branding Studio',
}

export default async function BrandingStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ surface?: string | string[]; item?: string | string[] }>
}) {
  const { tenant: tenantSlug } = await params
  // "Edit look" on a dish opens straight to the Item page with that dish.
  const query = await searchParams
  const requestedItemId = typeof query.item === 'string' ? query.item : null
  const tenantData = await getCachedTenantBySlug(tenantSlug)

  if (!tenantData) redirect('/')

  // A real item id lets the Product surface preview the live item detail page;
  // the full list feeds the hero featured-product picker.
  // Non-critical: fall back to empty (menu page) if the lookup fails.
  let sampleItemId: string | null = null
  let products: { id: string; name: string }[] = []
  let sampleMenuItem: MenuItem | null = null
  try {
    const items = await getMenuItemsByTenant(tenantData.id)
    // Preview the dish the owner came from, else the one with the most to style.
    sampleItemId = pickPreviewItemId(items, requestedItemId)
    products = items.map((item) => ({ id: item.id, name: item.name }))
    // The card gallery previews each design on a real dish — ideally one
    // with a photo and a description, so every template has content to show.
    sampleMenuItem =
      items.find((item) => item.image_url && item.description) ??
      items.find((item) => item.image_url) ??
      items[0] ??
      null
  } catch {
    sampleItemId = null
    products = []
  }

  // Categories feed the Menu Layout surface's arrangement panel.
  // Non-critical: fall back to empty (panel shows its empty state) on failure.
  let categories: Category[] = []
  try {
    categories = await getCategoriesByTenant(tenantData.id)
  } catch {
    categories = []
  }

  // Saved product-detail settings seed the Product surface's fields.
  // Non-critical: fall back to null (registry defaults) if the lookup fails.
  const productResult = await getProductDetailSettings(tenantData.id)
  const productSettings = productResult.success ? productResult.data : null

  return (
    <BrandingStudio
      tenant={tenantData}
      tenantSlug={tenantSlug}
      sampleItemId={sampleItemId}
      productSettings={productSettings}
      products={products}
      categories={categories}
      sampleMenuItem={sampleMenuItem}
      initialSurfaceId={surfaceFrom(query.surface)}
    />
  )
}
