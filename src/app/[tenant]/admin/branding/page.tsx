import { redirect } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getCategoriesByTenant, getMenuItemsByTenant } from '@/lib/admin-service'
import type { Category } from '@/types/database'
import { getProductDetailSettings } from '@/app/actions/product-detail-settings'
import { BrandingStudio } from '@/components/admin/branding-studio/branding-studio'

export const metadata = {
  title: 'Branding Studio',
}

export default async function BrandingStudioPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const tenantData = await getCachedTenantBySlug(tenantSlug)

  if (!tenantData) redirect('/')

  // A real item id lets the Product surface preview the live item detail page;
  // the full list feeds the hero featured-product picker.
  // Non-critical: fall back to empty (menu page) if the lookup fails.
  let sampleItemId: string | null = null
  let products: { id: string; name: string }[] = []
  try {
    const items = await getMenuItemsByTenant(tenantData.id)
    sampleItemId = items[0]?.id ?? null
    products = items.map((item) => ({ id: item.id, name: item.name }))
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
    />
  )
}
