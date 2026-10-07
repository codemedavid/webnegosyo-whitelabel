import { redirect } from 'next/navigation'
import { AdminLayoutClient } from '@/components/admin/admin-layout-client'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import { getRequestSubscription } from '@/lib/auth/request-caller'
import { resolveSubscriptionAccess } from '@/lib/billing/subscription-status'
import type { Tenant } from '@/types/database'
import { canAccessStoreAdmin } from '@/lib/platform-staff/permissions'
import { toAdminShellTenant } from '@/lib/admin-shell-tenant'
import { PrelaunchBanner } from '@/components/admin/launch/prelaunch-banner'

// Authenticated, per-request, never pre-rendered at build time (see the
// superadmin layout for why this is pinned rather than inferred).
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ 
  children,
  params,
}: { 
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  // One parallel batch, not a waterfall: this layout sits in front of every
  // admin page, and it used to read the user, then the tenant, then the
  // subscription one after another. The subscription read rides on the tenant
  // read so it overlaps the auth check; it is request-cached, so the
  // verifyTenantAdmin calls beneath this layout reuse it instead of re-reading.
  const tenantRead = getCachedTenantBySlug(tenantSlug)
  const [userRoleData, tenantData, subscription] = await Promise.all([
    getCachedCurrentUserRole(),
    tenantRead,
    tenantRead.then((found) => (found ? getRequestSubscription(found.id) : null)),
  ])

  if (!userRoleData) {
    redirect(`/${tenantSlug}/login?redirect=/${tenantSlug}/admin`)
  }

  const userRole = userRoleData

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
    /** platform_staff grants; `stores.view` opens any store's admin. */
    platform_permissions?: string[] | null
  }
  const role = userRole as UserRoleType
  const isAuthorized = canAccessStoreAdmin(role, tenant.id, 'view')

  if (!isAuthorized) {
    redirect(`/${tenantSlug}/login?error=unauthorized`)
  }

  // The subscription gate. A superadmin is exempt — they are the only account
  // that can clear an unpaid subscription, and a gate that locks out its own
  // remedy cannot be fixed from inside the product. Platform staff are exempt
  // for the same reason `assertSubscriptionActive` exempts them: they act for
  // the platform, not the store.
  //
  // This is the UX half only. The boundary is `assertSubscriptionActive` inside
  // the server actions: a redirect here is a rendering decision and does not
  // stop a POST aimed straight at an action.
  if (role.role !== 'superadmin' && role.role !== 'platform_staff') {
    if (resolveSubscriptionAccess(subscription, new Date().toISOString()).isBlocked) {
      // Deliberately OUTSIDE the admin tree. A paused screen rendered under
      // this same layout would be redirected to itself, forever.
      redirect(`/${tenantSlug}/subscription`)
    }
  }

  return (
    <AdminLayoutClient
      tenantSlug={tenantSlug}
      tenant={toAdminShellTenant(tenant)}
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
      {tenant.is_prelaunch === true && <PrelaunchBanner tenantSlug={tenantSlug} />}
      {children}
    </AdminLayoutClient>
  )
}

