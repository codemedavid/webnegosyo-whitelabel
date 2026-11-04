import { notFound, redirect } from 'next/navigation'

import { getCachedTenantBySlug } from '@/lib/cache'
import { generateBrandingCSS, getTenantBranding } from '@/lib/branding-utils'
import { hasPageDesign, readConfirmationRedirect, storedPageDesign } from '@/lib/page-designer/page-mode'
import { pageBySlug, PAGE_META } from '@/lib/page-designer/pages'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import { readStorefrontLabels } from '@/lib/storefront-labels'
import { PageDesignerEditor } from '@/components/page-designer/editor/page-designer-editor'
import { pageThemeStyle } from '@/components/page-designer/editor/page-theme'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ tenant: string; page: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const page = pageBySlug((await params).page)
  return { title: page ? `Page Designer · ${PAGE_META[page].label}` : 'Page Designer' }
}

export default async function PageDesignerPage({ params }: PageProps) {
  const { tenant: tenantSlug, page: slug } = await params
  const page = pageBySlug(slug)
  if (!page) notFound()
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) redirect('/')

  const row = tenant as unknown as Record<string, unknown>
  const brandStyle = {
    ...generateBrandingCSS(getTenantBranding(row)),
    ...pageThemeStyle(page, row),
  }
  return (
    <PageDesignerEditor
      tenantId={tenant.id}
      tenantSlug={tenantSlug}
      page={page}
      storeName={tenant.name}
      labels={readStorefrontLabels(row) as Record<string, string>}
      // Built here, not in the browser: the standard design's fresh ids must match on both sides.
      initialDesign={storedPageDesign(row, page) ?? createStandardDesign(page)}
      initialIsLive={hasPageDesign(row, page)}
      brandStyle={brandStyle}
      redirect={readConfirmationRedirect(row)}
    />
  )
}
