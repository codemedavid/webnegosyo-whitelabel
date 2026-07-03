import { redirect } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
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

  return <BrandingStudio tenant={tenantData} tenantSlug={tenantSlug} />
}
