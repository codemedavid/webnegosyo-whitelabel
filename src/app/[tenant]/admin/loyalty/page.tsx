import { notFound } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { LoyaltyProgramsManagement } from '@/components/admin/loyalty-programs-management'
export default async function LoyaltyAdminPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: slug } = await params
  const tenant = await getCachedTenantBySlug(slug)
  if (!tenant) notFound()
  return <LoyaltyProgramsManagement tenantId={tenant.id} tenantSlug={slug} />
}
