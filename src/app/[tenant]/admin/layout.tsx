import { redirect } from 'next/navigation'
import { AdminLayoutClient } from '@/components/admin/admin-layout-client'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { fetchSubscription } from '@/lib/billing/subscription-repository'
import { resolveSubscriptionAccess } from '@/lib/billing/subscription-status'
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
  const userRoleData = await getCachedCurrentUserRole()
  
  if (!userRoleData) {
    redirect(`/${tenantSlug}/login?redirect=/${tenantSlug}/admin`)
  }

  const userRole = userRoleData

  // Get tenant
  const tenantData = await getCachedTenantBySlug(tenantSlug)
  
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
  type UserRoleType = {
    role: string
    tenant_id: string | null
    is_owner?: boolean | null
    permissions?: string[] | null
    /** Absent when the row came through the pre-branch fallback projection. */
    outlet_id?: string | null
  }
  const role = userRole as UserRoleType
  const isAuthorized =
    role.role === 'superadmin' ||
    (role.role === 'admin' && role.tenant_id === tenant.id)

  if (!isAuthorized) {
    redirect(`/${tenantSlug}/login?error=unauthorized`)
  }

  // The subscription gate. A superadmin is exempt — they are the only account
  // that can clear an unpaid subscription, and a gate that locks out its own
  // remedy cannot be fixed from inside the product.
  //
  // This is the UX half only. The boundary is `assertSubscriptionActive` inside
  // the server actions: a redirect here is a rendering decision and does not
  // stop a POST aimed straight at an action.
  if (role.role !== 'superadmin') {
    const supabase = await createClient()
    const subscription = await fetchSubscription(supabase, tenant.id)

    if (resolveSubscriptionAccess(subscription, new Date().toISOString()).isBlocked) {
      // Deliberately OUTSIDE the admin tree. A paused screen rendered under
      // this same layout would be redirected to itself, forever.
      redirect(`/${tenantSlug}/subscription`)
    }
  }

  return (
    <AdminLayoutClient
      tenantSlug={tenantSlug}
      tenant={tenant}
      caller={{
        role: role.role,
        is_owner: role.is_owner ?? false,
        permissions: role.permissions ?? null,
        // The branch this account is confined to, if any. Dropping it here is
        // what let the Branches entry render for a manager: the read already
        // returns the column, nothing downstream was given it.
        outlet_id: role.outlet_id ?? null,
      }}
    >
      {children}
    </AdminLayoutClient>
  )
}

