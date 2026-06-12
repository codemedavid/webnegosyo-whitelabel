'use client'

import { useRouter } from 'next/navigation'
import { Sidebar, MobileSidebar, adminSidebarItems, type SidebarEntry } from '@/components/shared/sidebar'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Tenant } from '@/types/database'
import { useMemo } from 'react'

interface AdminLayoutClientProps {
  children: React.ReactNode
  tenantSlug: string
  tenant: Tenant
}

export function AdminLayoutClient({ children, tenantSlug, tenant }: AdminLayoutClientProps) {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()

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
  const itemsWithBasePath: SidebarEntry[] = useMemo(
    () =>
      adminSidebarItems.map((entry) => {
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
      }),
    [basePath]
  )

  const sidebarProps = {
    items: itemsWithBasePath,
    basePath,
    onLogout: handleLogout,
    tenantName: tenant.name,
    enableOrderManagement: tenant.enable_order_management,
    menuEngineeringEnabled: tenant.menu_engineering_enabled,
    bundlesEnabled: tenant.bundles_enabled,
    convexConfigured: !!tenant.convex_deployment_url,
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — hidden on mobile via internal `hidden md:flex` */}
      <Sidebar {...sidebarProps} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header + sheet — visible only below md */}
        <MobileSidebar {...sidebarProps} />

        <main className="flex-1">
          <div className="container mx-auto p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
