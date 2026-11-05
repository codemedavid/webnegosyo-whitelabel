import { notFound, redirect } from 'next/navigation'

import { getCachedTenantBySlug } from '@/lib/cache'
import { hasPageDesign, readConfirmationRedirect, storedPageDesign } from '@/lib/page-designer/page-mode'
import { pageBySlug, PAGE_META } from '@/lib/page-designer/pages'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import { lookStoreRow } from '@/lib/page-designer/look'
import { PageDesignerEditor } from '@/components/page-designer/editor/page-designer-editor'

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
  return (
    <PageDesignerEditor
      tenantId={tenant.id}
      tenantSlug={tenantSlug}
      page={page}
      storeName={tenant.name}
      storeRow={lookStoreRow(row)}
      // Built here, not in the browser: the standard design's fresh ids must match on both sides.
      initialDesign={storedPageDesign(row, page) ?? createStandardDesign(page)}
      initialIsLive={hasPageDesign(row, page)}
      redirect={readConfirmationRedirect(row)}
    />
  )
}
