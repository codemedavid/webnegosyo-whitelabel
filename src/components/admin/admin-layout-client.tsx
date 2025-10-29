'use client'

import { useRouter } from 'next/navigation'
import { Sidebar, adminSidebarItems } from '@/components/shared/sidebar'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Tenant } from '@/types/database'

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
  const itemsWithBasePath = adminSidebarItems.map((item) => ({
    ...item,
    href: `${basePath}${item.href}`,
  }))

  return (
    <div className="flex h-screen">
      <Sidebar
        items={itemsWithBasePath}
        basePath={basePath}
        onLogout={handleLogout}
        tenantName={tenant.name}
        enableOrderManagement={tenant.enable_order_management}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  )
}

