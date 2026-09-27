import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { OrderDeletionWizard } from '@/components/admin/order-deletion/order-deletion-wizard'
import { getCachedCurrentUserRole, getCachedTenantBySlug } from '@/lib/cache'
import { decideOwnerAccess } from '@/lib/order-deletion/access'
import { resolveOrderBackend } from '@/lib/order-backend'

/**
 * Owner-only. The page gate is a courtesy; every route behind it re-checks the
 * owner, and the database functions check again.
 */
export default async function DeleteOrdersPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) return <div>Tenant not found</div>

  const userRole = await getCachedCurrentUserRole()
  const access = decideOwnerAccess(
    userRole ? { role: userRole.role, tenant_id: userRole.tenant_id, is_owner: userRole.is_owner ?? null } : null,
    tenant.id
  )
  if (!access.allowed || resolveOrderBackend(tenant) !== 'platform') {
    redirect(`/${tenantSlug}/admin/settings`)
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Settings', href: `/${tenantSlug}/admin/settings` },
          { label: 'Delete orders' },
        ]}
      />
      <OrderDeletionWizard tenantId={tenant.id} storeName={tenant.name} />
    </div>
  )
}
