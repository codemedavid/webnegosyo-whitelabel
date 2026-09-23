import { notFound } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { LoyaltyWorkspace } from '@/components/admin/loyalty-workspace'
export default async function LoyaltyAdminPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: slug } = await params
  const tenant = await getCachedTenantBySlug(slug)
  if (!tenant) notFound()
  return <LoyaltyWorkspace tenantId={tenant.id} tenantSlug={slug} />
}
