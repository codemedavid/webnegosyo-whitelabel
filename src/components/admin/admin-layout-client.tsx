'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Sidebar, MobileSidebar, adminSidebarItems, type SidebarEntry } from '@/components/shared/sidebar'
import { createClient } from '@/lib/supabase/client'
import { signOutThisDevice } from '@/lib/supabase/sign-out'
import { toast } from 'sonner'
import type { AdminShellTenant } from '@/lib/admin-shell-tenant'
import {
  filterSidebarEntriesByPermission,
  type PermissionHolder,
} from '@/lib/staff-permissions'
import { canViewBranchDirectory, resolveBranchScope } from '@/lib/outlets/branch-scope'
import { AssistantLauncher } from '@/components/admin/assistant/assistant-launcher'
import { useMemo } from 'react'

/** The signed-in admin: what they may do, and which branch they run. */
type AdminCaller = PermissionHolder & { outlet_id?: string | null }

interface AdminLayoutClientProps {
  children: React.ReactNode
  tenantSlug: string
  /** Projected by `toAdminShellTenant` — never the full row (it is serialized to the browser). */
  tenant: AdminShellTenant
  caller?: AdminCaller
}

export function AdminLayoutClient({ children, tenantSlug, tenant, caller }: AdminLayoutClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  // Branding Studio, Receipt Studio and the Hero Builder are full-screen
  // workspaces with their own top bars — no sidebar/container chrome, which
  // would stack over them.
  const isFullBleedRoute =
    (pathname?.startsWith(`/${tenantSlug}/admin/branding`) ||
      pathname?.startsWith(`/${tenantSlug}/admin/receipt-editor`) ||
      pathname?.startsWith(`/${tenantSlug}/admin/hero-designer`)) ??
    false

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      const { error } = await signOutThisDevice(supabase)

      if (error) {
        toast.error('Failed to logout')
        console.error('Logout error:', error)
        return
      }

      toast.success('Logged out successfully')
      router.push(`/${tenantSlug}/login`)
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
      toast.error('An unexpected error occurred')
    }
  }

  const basePath = `/${tenantSlug}`
  const itemsWithBasePath: SidebarEntry[] = useMemo(() => {
    // Restricted staff only see the sections they were granted; hrefs are
    // permission-mapped before the tenant prefix is prepended.
    const permitted = caller
      ? filterSidebarEntriesByPermission(adminSidebarItems, caller)
      : adminSidebarItems
    return permitted.map((entry) => {
        if ('children' in entry) {
          return {
            ...entry,
            children: entry.children.map((child) => ({
              ...child,
              href: `${basePath}${child.href}`,
            })),
          }
        }
        return { ...entry, href: `${basePath}${entry.href}` }
      })
  }, [basePath, caller])

  const sidebarProps = {
    items: itemsWithBasePath,
    basePath,
    onLogout: handleLogout,
    tenantName: tenant.name,
    tenantLogoUrl: tenant.logo_url || null,
    storefrontHref: `${basePath}/menu`,
    enableOrderManagement: tenant.enable_order_management,
    menuEngineeringEnabled: tenant.menu_engineering_enabled,
    bundlesEnabled: tenant.bundles_enabled,
    convexConfigured: tenant.is_convex_configured,
    inventoryEnabled: tenant.inventory_enabled,
    multiBranchEnabled: tenant.multi_branch_enabled,
    // A branch manager runs one branch; the section that lists every branch is
    // not theirs to open, so it is not offered. With no caller (the pre-auth
    // render) this reads as store-wide, matching the permission filter above.
    isBranchScopedAccount: caller ? !canViewBranchDirectory(caller) : false,
  }

  // The owl is for store-wide accounts on stores a superadmin switched it on for;
  // the API enforces the same rules, this only avoids offering a refusal.
  const showAssistant = tenant.assistant_enabled && (!caller || resolveBranchScope(caller).kind === 'all')

  if (isFullBleedRoute) {
    return <>{children}</>
  }

  return (
    <div className="admin-shell flex min-h-screen bg-background">
      {/* Desktop sidebar — hidden on mobile via internal `hidden md:flex` */}
      <Sidebar {...sidebarProps} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header + sheet — visible only below md */}
        <MobileSidebar {...sidebarProps} />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-8 md:py-8">{children}</div>
        </main>
      </div>
      {showAssistant ? <AssistantLauncher tenantId={tenant.id} adminBasePath={`${basePath}/admin`} /> : null}
    </div>
  )
}
