import { redirect } from 'next/navigation'
import { AdminLayoutClient } from '@/components/admin/admin-layout-client'
import { getTenantBySlug } from '@/lib/admin-service'
import { getCurrentUserRole } from '@/lib/admin-service'
import type { Tenant } from '@/types/database'

export default async function AdminLayout({ 
  children,
  params,
}: { 
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  
  // Check authentication
  const userRoleData = await getCurrentUserRole()
  
  if (!userRoleData) {
    redirect(`/${tenantSlug}/login?redirect=/${tenantSlug}/admin`)
  }

  const userRole = userRoleData

  // Get tenant
  const tenantData = await getTenantBySlug(tenantSlug)
  
  if (!tenantData) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Tenant not found</h1>
          <p className="text-muted-foreground">The restaurant you&apos;re looking for doesn&apos;t exist.</p>
        </div>
      </div>
    )
  }

  const tenant: Tenant = tenantData

  // Verify authorization - need to cast userRole to access properties
  type UserRoleType = { role: string; tenant_id: string | null }
  const role = userRole as UserRoleType
  const isAuthorized = 
    role.role === 'superadmin' || 
    (role.role === 'admin' && role.tenant_id === tenant.id)

  if (!isAuthorized) {
    redirect(`/${tenantSlug}/login?error=unauthorized`)
  }

  return (
    <AdminLayoutClient tenantSlug={tenantSlug} tenant={tenant}>
      {children}
    </AdminLayoutClient>
  )
}

